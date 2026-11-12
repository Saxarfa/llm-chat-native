import UIKit
import XCTest
@testable import LLMChat

/// 0.11: время в «Недавних», состояние компьютера, аватары, чтение вслух, тема.
final class ClaudeLookTests: XCTestCase {
    func testRelativeTime() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let millis = now.timeIntervalSince1970 * 1000
        XCTAssertEqual(RelativeTime.text(millis - 10_000, now: now), "только что")
        XCTAssertEqual(RelativeTime.text(0, now: now), "")
        let twoWeeks = RelativeTime.text(millis - 14 * 86_400_000, now: now)
        XCTAssertTrue(twoWeeks.contains("недел"), twoWeeks)
        XCTAssertTrue(RelativeTime.text(millis - 5 * 60_000, now: now).contains("5"))
    }

    func testSystemOverviewFromServer() {
        let json: [String: Any] = [
            "services": [["name": "Модели чата", "online": true], ["name": "ComfyUI", "online": false]],
            "loaded_models": ["gemma", ["model": "qwen"]],
            "tasks": [["kind": "chat", "id": 12, "title": "Чат", "status": "running", "phase": "Генерация ответа"],
                      ["kind": "image", "id": "j1", "title": "Арт", "status": "queued", "progress": 40],
                      ["kind": "knowledge", "id": "d1", "title": "Документ", "status": "processing"]],
            "gpu_busy": true, "cpu_percent": 12.5,
            "ram": ["used_mb": 2048, "total_mb": 8192],
            "gpus": [["name": "RTX", "total_mb": 24000, "used_mb": 12000, "utilization": 50]],
        ]
        let overview = SystemOverview(json: json)
        XCTAssertEqual(overview.services.map(\.online), [true, false])
        XCTAssertEqual(overview.loadedModels, ["gemma", "qwen"])
        XCTAssertEqual(overview.tasks.map(\.id), ["12", "j1", "d1"])
        XCTAssertEqual(overview.tasks[1].progress, 40)
        XCTAssertEqual(overview.tasks[1].phase, "queued", "без фазы показывается статус")
        XCTAssertFalse(overview.tasks[2].stoppable, "документ базы знаний не останавливается")
        XCTAssertEqual(overview.ramTotalMB, 8192)
        XCTAssertEqual(overview.gpus.first?.utilization, 50)
        XCTAssertTrue(overview.gpuBusy)
        XCTAssertEqual(ComputerPage.gb(12_288), "12,0 ГБ")
    }

    func testAvatarRoundTrip() {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 400, height: 300)).image { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 400, height: 300))
        }
        guard let encoded = AvatarCache.encode(image) else { return XCTFail("аватар не закодирован") }
        XCTAssertTrue(encoded.hasPrefix("data:image/jpeg;base64,"))
        let decoded = AvatarCache.image(encoded)
        XCTAssertEqual(decoded?.size.width, decoded?.size.height, "квадрат из середины")
        XCTAssertNil(AvatarCache.image(""))
        XCTAssertNil(AvatarCache.image("https://example.com/a.png"))
    }

    func testReadAloudSkipsMarkdown() {
        XCTAssertEqual(ReadAloud.plain("## Итог\n**Жирный** и `код`"), " Итог\nЖирный и код")
    }

    @MainActor
    func testPreviewThemeAndQueueTasks() async {
        let light = AppModel(preview: .light)
        XCTAssertEqual(light.appearance, .light)
        XCTAssertEqual(AppModel(preview: .thread).appearance, .dark)

        let app = AppModel(preview: .queue)
        await app.bootstrap()
        XCTAssertEqual(app.queuedTasks.count, 1, "вопрос из очереди — задача в «Компьютере»")
        if let task = app.queuedTasks.first {
            try? await app.stopTask(task)
        }
        XCTAssertTrue(app.queuedTasks.isEmpty)
        XCTAssertEqual(PreviewScene.overview.tasks.count, 2)
    }

    @MainActor
    func testProfileModelsIncludeProfiles() async {
        let app = AppModel(preview: .settings)
        await app.bootstrap()
        app.settings.modelProfiles["old-model"] = ["alias": "Старая"]
        XCTAssertTrue(app.profileModels.contains("old-model"))
        XCTAssertEqual(app.profileModels.filter { $0 == "gemma-26b-qat" }.count, 1, "без повторов")
        await app.saveModelProfile("gemma-26b-qat", ["tagline": "Для кода"])
        XCTAssertEqual(ChatConfig.text(ChatConfig.dict(app.settings.modelProfiles["gemma-26b-qat"])["tagline"]), "Для кода")
    }
}
