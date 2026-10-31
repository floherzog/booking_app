// Resolves the grammatical gender of German venue names using Apple's on-device
// model, so the app can pick "der/die/das" correctly.
//
// Electron cannot call FoundationModels (Swift-only), so this sits in the bundle
// as a tiny executable the main process spawns. It speaks JSON on stdin/stdout:
//
//   echo '{"names":["Kulturfabrik","Berghain"]}' | article-helper
//   → {"ok":true,"genders":{"Kulturfabrik":"f","Berghain":"n"}}
//
//   echo '{"kind":"firstname","names":["Anna","Thomas","Kim"]}' | article-helper
//   → {"ok":true,"genders":{"Anna":"f","Thomas":"m","Kim":"x"}}
//
//   article-helper --availability
//   → {"ok":true,"status":"available"}
//
// The first-name kind feeds the "Liebe / Lieber" greeting: f, m, or x when the
// name is used for both or is not a first name at all.
//
// Gender is a context-free property of the name, which is why only this part is
// asked of the model: the result caches permanently, and everything that depends
// on the surrounding sentence (case, contraction) is handled in JS where it can
// be tested.

import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

struct Input: Decodable { var names: [String]; var kind: String? }

func emit(_ object: [String: Any]) {
    let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    FileHandle.standardOutput.write(data ?? Data("{\"ok\":false,\"error\":\"encode failed\"}".utf8))
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func fail(_ status: String, _ message: String) -> Never {
    emit(["ok": false, "status": status, "error": message])
    exit(0) // a clean exit with ok:false — the caller reads the status, not the code
}

// One letter per name, so the reply is short and easy to validate.
let instructions = """
You identify the grammatical gender of German proper nouns naming music venues.
Reply with exactly one lowercase token and nothing else:
  m  — masculine (der Hof, der Keller, der Club)
  f  — feminine  (die Fabrik, die Halle, die Kneipe)
  n  — neuter    (das Kulturzentrum, das Haus, das Werk)
  pl — plural    (die Sophiensäle)
For a compound noun the gender is that of its final element.
For an invented or foreign name with no obvious German head noun, answer n.
Never explain. Never use a capital letter. Never answer with anything else.
"""

let firstNameInstructions = """
You tell whether a first name is usually given to women or to men, as used in German-speaking countries.
Reply with exactly one lowercase token and nothing else:
  f — usually a woman's name (Anna, Julia, Maria)
  m — usually a man's name (Thomas, Jan, Lukas)
  x — used for both, unclear, or not a first name at all (Kim, Alex, Team, Booking)
Never explain. Never use a capital letter. Never answer with anything else.
"""

func normalizeFirstName(_ raw: String) -> String? {
    let token = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if token.hasPrefix("f") { return "f" }
    if token.hasPrefix("m") { return "m" }
    if token.hasPrefix("x") { return "x" }
    return nil
}

func normalize(_ raw: String) -> String? {
    let token = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if token.hasPrefix("pl") { return "pl" }
    if token.hasPrefix("m") { return "m" }
    if token.hasPrefix("f") { return "f" }
    if token.hasPrefix("n") { return "n" }
    return nil
}

let wantsAvailability = CommandLine.arguments.contains("--availability")

#if canImport(FoundationModels)
guard #available(macOS 26.0, *) else {
    fail("unsupported", "This Mac runs a macOS older than 26, which has no on-device model.")
}

let model = SystemLanguageModel.default
switch model.availability {
case .available:
    break
case .unavailable(let reason):
    switch reason {
    case .appleIntelligenceNotEnabled:
        fail("disabled", "Apple Intelligence is switched off in System Settings.")
    case .modelNotReady:
        fail("downloading", "The on-device model is still downloading. Try again shortly.")
    case .deviceNotEligible:
        fail("ineligible", "This Mac does not support Apple Intelligence.")
    @unknown default:
        fail("unavailable", "The on-device model is unavailable.")
    }
@unknown default:
    fail("unavailable", "The on-device model is unavailable.")
}

if wantsAvailability {
    emit(["ok": true, "status": "available"])
    exit(0)
}

let raw = FileHandle.standardInput.readDataToEndOfFile()
guard let input = try? JSONDecoder().decode(Input.self, from: raw) else {
    fail("bad-input", "Expected {\"names\":[…]} on stdin.")
}
let firstNames = input.kind == "firstname"

var genders: [String: String] = [:]
var failures: [String] = []

for name in input.names {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { continue }
    do {
        // A fresh session per name: these are independent questions, and a shared
        // session would carry one venue's answer into the next one's context.
        let session = LanguageModelSession(instructions: firstNames ? firstNameInstructions : instructions)
        let reply = try await session.respond(to: trimmed)
        if let gender = firstNames ? normalizeFirstName(reply.content) : normalize(reply.content) {
            genders[trimmed] = gender
        } else {
            failures.append(trimmed)
        }
    } catch {
        failures.append(trimmed)
    }
}

emit(["ok": true, "status": "available", "genders": genders, "failed": failures])
exit(0)

#else
fail("unsupported", "This build has no FoundationModels framework available.")
#endif
