import XCTest
@testable import LLMChat

/// Разбор ответов студии так, как их отдаёт JSONSerialization (числа приходят как NSNumber).
final class StudioDataTests: XCTestCase {
    private func json(_ text: String) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
    }

    /// 0 и 1 — числа, а не true/false: CLIP 0 не должен откатываться к силе модели.
    func testZeroAndOneAreNumbers() {
        let values = json(#"{"zero": 0, "one": 1, "half": 0.5, "flag": true, "off": false, "text": "1.25"}"#)
        XCTAssertEqual(StudioValue.double(values["zero"]), 0)
        XCTAssertEqual(StudioValue.double(values["one"]), 1)
        XCTAssertEqual(StudioValue.double(values["half"]), 0.5)
        XCTAssertNil(StudioValue.double(values["flag"]))
        XCTAssertNil(StudioValue.double(values["off"]))
        XCTAssertEqual(StudioValue.double(values["text"]), 1.25)
        XCTAssertEqual(StudioValue.int(values["one"]), 1)
    }

    func testLoraClipZeroSurvivesServerRoundTrip() {
        let values = json(#"{"name": "silvana-style-AB10-01.safetensors", "strength": 1, "strength_clip": 0}"#)
        let lora = StudioLora(json: values)
        XCTAssertEqual(lora?.strength, 1)
        XCTAssertEqual(lora?.strengthClip, 0)
        XCTAssertEqual(lora?.clip, 0)
        XCTAssertEqual(lora?.json["strength_clip"] as? Double, 0)
    }

    func testModelStrengthZeroIsKept() {
        let lora = StudioLora(json: json(#"{"name": "a.safetensors", "strength": 0, "strength_clip": 1}"#))
        XCTAssertEqual(lora?.strength, 0)
        XCTAssertEqual(lora?.clip, 1)
    }
}
