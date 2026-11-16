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

    /// Проектор картинок (mmproj) качается вместе с моделью: предпочтение — F16, затем BF16, Q8_0.
    func testVisionProjectorIsPicked() {
        let tree: [[String: Any]] = [
            ["type": "file", "path": "model-Q4_K_M.gguf", "size": 2_500_000_000],
            ["type": "file", "path": "mmproj-BF16.gguf", "size": 900_000_000],
            ["type": "file", "path": "mmproj-F16.gguf", "size": 900_000_000],
            ["type": "file", "path": "mmproj-F32.gguf", "size": 1_800_000_000],
        ]
        let projectors = HFFile.projectors(tree)
        XCTAssertEqual(projectors.count, 3)
        XCTAssertEqual(HFFile.bestProjector(projectors)?.file, "mmproj-F16.gguf")
        XCTAssertEqual(HFFile.bestProjector(projectors.filter { !$0.file.contains("-F16") })?.file, "mmproj-BF16.gguf")
        XCTAssertNil(HFFile.bestProjector(HFFile.projectors([["type": "file", "path": "model-Q4_K_M.gguf", "size": 1]])))
        XCTAssertEqual(PhoneModels.visionKey(for: "m.gguf"), "Vision/m.gguf")
    }

    /// Процент готовности арта — только у ComfyUI; у AI Studio его нет.
    func testArtProgressOnlyForComfy() {
        let comfy = FeedArt(json: ["id": "a", "status": "generating", "progress": 42])
        XCTAssertEqual(comfy?.progress ?? -1, 0.42, accuracy: 0.0001)
        let studio = FeedArt(json: ["id": "b", "status": "generating", "progress": 50, "provider": "aistudio"])
        XCTAssertNil(studio?.progress)
        XCTAssertNil(FeedArt(json: ["id": "c", "status": "generating"])?.progress)
    }

    /// MTP: по умолчанию включено, выключается в параметрах модели.
    func testMTPSetting() {
        XCTAssertTrue(PhoneSampling(config: [:]).mtp)
        XCTAssertFalse(PhoneSampling(config: ["mtp": false]).mtp)
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

    /// Полный набор параметров выборки llama.cpp у моделей телефона (замечание 16.11.2026).
    func testFullSamplingSettings() {
        let defaults = PhoneSampling(config: [:])
        XCTAssertEqual(defaults.repeatLastN, 64)
        XCTAssertEqual(defaults.typicalP, 1)
        XCTAssertEqual(defaults.dryBase, 1.75, accuracy: 0.0001)
        XCTAssertEqual(defaults.seed, -1)

        let tuned = PhoneSampling(config: [
            "repeat_last_n": 128, "typical_p": 0.9, "top_n_sigma": 1.5, "xtc_probability": 0.5,
            "xtc_threshold": 0.15, "dry_multiplier": 0.8, "dry_base": 2, "dry_allowed_length": 3,
            "dry_penalty_last_n": 256, "seed": 42, "frequency_penalty": 0.3,
        ])
        XCTAssertEqual(tuned.repeatLastN, 128)
        XCTAssertEqual(tuned.topNSigma, 1.5, accuracy: 0.0001)
        XCTAssertEqual(tuned.xtcProbability, 0.5, accuracy: 0.0001)
        XCTAssertEqual(tuned.dryAllowedLength, 3)
        XCTAssertEqual(tuned.dryPenaltyLastN, 256)
        XCTAssertEqual(tuned.seed, 42)
        XCTAssertEqual(tuned.frequencyPenalty, 0.3, accuracy: 0.0001)
    }

    /// Названия параметров не переводятся; Presence и Frequency penalty видны у модели телефона.
    func testPhoneSettingNamesStayEnglish() {
        let keys = ChatParameters.allSpecs(for: "phone/model.gguf", onPhone: true).map(\.key)
        for key in ["presence_penalty", "frequency_penalty", "repeat_last_n", "typical_p", "xtc_probability",
                    "dry_multiplier", "seed"] {
            XCTAssertTrue(keys.contains(key), key)
        }
        let latin = ChatParameters.allSpecs(for: "phone/model.gguf", onPhone: true).allSatisfy { spec in
            spec.label.unicodeScalars.allSatisfy { $0.value < 0x0400 || $0.value > 0x04FF }
        }
        XCTAssertTrue(latin)
        // У моделей на ПК остаются только параметры, которые знает сервер.
        let pc = ChatParameters.allSpecs(for: "gemma-26b-qat", onPhone: false).map(\.key)
        XCTAssertFalse(pc.contains("typical_p"))
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
        XCTAssertEqual(AppModel.phoneTitle("   "), "Новая сессия")
    }
}
