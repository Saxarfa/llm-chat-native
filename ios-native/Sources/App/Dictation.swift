import AVFoundation
import Foundation
import Observation
import Speech

/// Диктовка в поле ввода: речь распознаёт iOS (на самом телефоне, если он это умеет),
/// текст дописывается к уже набранному по мере речи. Повторное нажатие — стоп.
@Observable
final class Dictation {
    private(set) var active = false
    /// Почему не получилось начать — показывается над полем ввода.
    var problem: String?

    @ObservationIgnored private var engine: AVAudioEngine?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?

    @MainActor
    func toggle(current: String, update: @escaping (String) -> Void) async {
        if active {
            stop()
        } else {
            await start(current: current, update: update)
        }
    }

    @MainActor
    func start(current: String, update: @escaping (String) -> Void) async {
        problem = nil
        let speech = await withCheckedContinuation { (done: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { done.resume(returning: $0) }
        }
        guard speech == .authorized else {
            problem = "Разрешите распознавание речи: Настройки iPhone → LLM Chat."
            return
        }
        guard await AVAudioApplication.requestRecordPermission() else {
            problem = "Разрешите доступ к микрофону: Настройки iPhone → LLM Chat."
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ru-RU")), recognizer.isAvailable else {
            problem = "Распознавание речи сейчас недоступно."
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }

        let engine = AVAudioEngine()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()
        } catch {
            engine.inputNode.removeTap(onBus: 0)
            problem = "Не удалось включить микрофон."
            return
        }

        let prefix = current.isEmpty || current.hasSuffix(" ") || current.hasSuffix("\n") ? current : current + " "
        self.engine = engine
        self.request = request
        active = true
        Haptics.tap()
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let final = result?.isFinal ?? false
            Task { @MainActor in
                guard let self else { return }
                if let text, !text.isEmpty { update(prefix + text) }
                if final || error != nil { self.finish() }
            }
        }
    }

    /// Микрофон выключается сразу, последний кусок текста дойдёт с финальным результатом.
    @MainActor
    func stop() {
        guard active else { return }
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        active = false
        Haptics.tap()
    }

    @MainActor
    private func finish() {
        if engine?.isRunning == true {
            engine?.stop()
            engine?.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task = nil
        request = nil
        engine = nil
        active = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
