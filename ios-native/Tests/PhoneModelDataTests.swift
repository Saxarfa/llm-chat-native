import XCTest
@testable import LLMChat

/// Модели на телефоне: имена, отбор файлов Hugging Face, память, размышления, параметры.
final class PhoneModelDataTests: XCTestCase {
    func testQuantAndTitle() {
        XCTAssertEqual(PhoneModelNames.quant("Qwen3-4B-Instruct-2507-Q4_K_M.gguf"), "Q4_K_M")
        XCTAssertEqual(PhoneModelNames.quant("gemma-3-4b-it-IQ3_XXS.gguf"), "IQ3_XXS")
        XCTAssertEqual(PhoneModelNames.quant("Llama-3.2-3B-Instruct.Q8_0.gguf"), "Q8_0")
        XCTAssertEqual(PhoneModelNames.quant("model-f16.gguf"), "F16")
        XCTAssertNil(PhoneModelNames.quant("tinyllama.gguf"))
        XCTAssertEqual(PhoneModelNames.title("Qwen3-4B-Instruct-2507-Q4_K_M.gguf"), "Qwen3 4B Instruct 2507")
        XCTAssertEqual(PhoneModelNames.display("phone/Qwen3-4B-Instruct-2507-Q4_K_M.gguf"), "Qwen3 4B Instruct 2507 · Q4_K_M")
        XCTAssertEqual(PhoneModelNames.title("tinyllama.gguf"), "tinyllama")
    }

    func testPhoneIDsAndGroup() {
        let id = PhoneModelID.make(file: "a-Q4_K_M.gguf")
        XCTAssertTrue(PhoneModelID.isPhone(id))
        XCTAssertEqual(PhoneModelID.file(of: id), "a-Q4_K_M.gguf")
        XCTAssertEqual(ChatConfig.group(of: id), .phone)
        XCTAssertEqual(ChatConfig.group(of: "gemma-26b-qat"), .local)
    }

    func testOnlyWholeGGUFFilesAreOffered() {
        let tree: [[String: Any]] = [
            ["type": "directory", "path": "Q4_K_M", "size": 0],
            ["type": "file", "path": "README.md", "size": 1200],
            ["type": "file", "path": "model-Q8_0.gguf", "size": 8, "lfs": ["size": 4_280_000_000]],
            ["type": "file", "path": "model-Q4_K_M.gguf", "size": 2_500_000_000],
            ["type": "file", "path": "mmproj-model-f16.gguf", "size": 800_000_000],
            ["type": "file", "path": "BF16/model-BF16-00001-of-00002.gguf", "size": 5_000_000_000],
            ["type": "file", "path": "Q2_K/model-Q2_K.gguf", "size": 1_600_000_000],
        ]
        let files = HFFile.list(tree)
        XCTAssertEqual(files.map(\.path), ["Q2_K/model-Q2_K.gguf", "model-Q4_K_M.gguf", "model-Q8_0.gguf"])
        XCTAssertEqual(files.last?.size, 4_280_000_000, "размер LFS важнее размера указателя")
        XCTAssertEqual(files.first?.file, "model-Q2_K.gguf")
    }

    func testMemoryFit() {
        let available: Int64 = 5_200_000_000
        XCTAssertEqual(PhoneMemory.fit(fileSize: 2_500_000_000, available: available), .fits)
        XCTAssertEqual(PhoneMemory.fit(fileSize: 3_900_000_000, available: available), .tight)
        XCTAssertEqual(PhoneMemory.fit(fileSize: 7_300_000_000, available: available), .tooBig)
        XCTAssertEqual(PhoneMemory.gigabytes(2_500_000_000), "2,5 ГБ")
        XCTAssertEqual(PhoneMemory.gigabytes(800_000_000), "800 МБ")
    }

    func testThinkSplitter() {
        XCTAssertEqual(ThinkSplitter.split("Привет").text, "Привет")
        let open = ThinkSplitter.split("<think>считаю")
        XCTAssertEqual(open.reasoning, "считаю")
        XCTAssertEqual(open.text, "")
        let done = ThinkSplitter.split("<think>\nдумаю\n</think>\n\nОтвет")
        XCTAssertEqual(done.reasoning, "думаю")
        XCTAssertEqual(done.text, "Ответ")
        // Шаблон сам открыл размышление: в выводе только закрывающий тег.
        let implicit = ThinkSplitter.split("план\n</think>Готово")
        XCTAssertEqual(implicit.reasoning, "план")
        XCTAssertEqual(implicit.text, "Готово")
    }

    func testSamplingFromChatParameters() {
        let config: [String: Any] = ["temperature": 0.6, "top_p": 0.95, "top_k": 20, "min_p": 0, "repeat_penalty": 1,
                                     "presence_penalty": 1.5, "max_tokens": 1024, "stop": ["</s>", ""]]
        let sampling = PhoneSampling(config: config)
        XCTAssertEqual(sampling.temperature, 0.6, accuracy: 0.0001)
        XCTAssertEqual(sampling.topK, 20)
        XCTAssertEqual(sampling.minP, 0)
        XCTAssertEqual(sampling.presencePenalty, 1.5, accuracy: 0.0001)
        XCTAssertEqual(sampling.maxTokens, 1024)
        XCTAssertEqual(sampling.stop, ["</s>"])
    }

    func testSearchResultParsing() {
        let repo = HFRepo(json: ["id": "unsloth/Qwen3-4B-GGUF", "downloads": 812_400, "likes": 214])
        XCTAssertEqual(repo?.author, "unsloth")
        XCTAssertEqual(repo?.name, "Qwen3-4B-GGUF")
        XCTAssertEqual(repo?.downloads, 812_400)
        XCTAssertNil(HFRepo(json: ["downloads": 1]))
    }

    func testPhoneChatTitle() {
        XCTAssertEqual(AppModel.phoneTitle("Короткий вопрос\nвторая строка"), "Короткий вопрос")
        XCTAssertEqual(AppModel.phoneTitle(String(repeating: "а", count: 40)), String(repeating: "а", count: 35) + "...")
        XCTAssertEqual(AppModel.phoneTitle("   "), "Новый диалог")
    }
}
