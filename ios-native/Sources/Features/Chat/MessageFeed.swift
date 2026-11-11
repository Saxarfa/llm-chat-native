import SwiftUI
import UIKit

/// Лента сообщений открытого чата. Открывается у последнего сообщения и, пока
/// пользователь не отлистал вверх, держится у низа во время живого ответа.
struct MessageFeed: View {
    @Environment(AppModel.self) private var model
    @State private var atBottom = true

    private static let bottomID = "feed-bottom"

    var body: some View {
        let live = model.activeLive
        switch model.threadChatID == model.activeChatID ? model.threadState : .loading {
        case .idle, .loading:
            ProgressView()
                .tint(Theme.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            FeedNotice(text: message, actionTitle: "Повторить") {
                Task { await model.loadThread() }
            }
        case .loaded:
            if model.thread.isEmpty && live == nil {
                FeedNotice(text: "В этом чате пока нет сообщений.", actionTitle: nil, action: {})
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 26) {
                            ForEach(model.thread) { message in
                                if message.isUser {
                                    UserMessageView(message: message, canEdit: live == nil)
                                } else if message.rawID != live?.replacingID {
                                    // Перегенерируемый ответ на время заменяет живая строка.
                                    AssistantMessageView(message: message, canRegenerate: live == nil)
                                }
                            }
                            if let live {
                                LiveAnswerView(live: live)
                            }
                            Color.clear
                                .frame(height: 1)
                                .id(Self.bottomID)
                                .onAppear { atBottom = true }
                                .onDisappear { atBottom = false }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 8)
                    }
                    .defaultScrollAnchor(model.preview == .threadTop ? .top : .bottom)
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: live?.text.count) {
                        if atBottom { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
                    }
                    .onChange(of: live?.phase) {
                        if atBottom { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
                    }
                    .onChange(of: live?.arts.count) {
                        if atBottom { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
                    }
                    .onChange(of: model.thread.count) {
                        // Свой новый вопрос всегда показываем, даже если лента была отлистана.
                        if atBottom || model.thread.last?.isUser == true {
                            withAnimation(Theme.spring) { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
                        }
                    }
                }
            }
        }
    }
}

/// Ответ, который пишется прямо сейчас.
private struct LiveAnswerView: View {
    let live: AppModel.LiveState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !live.reasoning.isEmpty {
                ReasoningView(text: live.reasoning, title: live.isThinking ? "Размышляет…" : "Размышления")
            }
            if !live.blocks.isEmpty {
                MarkdownView(blocks: live.blocks)
            }
            ForEach(live.arts) { art in
                ArtView(art: art)
            }
            if live.text.isEmpty || live.stopping {
                HStack(spacing: 10) {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Theme.muted)
                    Text(live.stopping ? "Останавливаю…" : live.phase)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(2)
                }
                .frame(minHeight: 28)
                .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct FeedNotice: View {
    let text: String
    let actionTitle: String?
    let action: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(text)
                .font(.system(size: 16))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            if let actionTitle {
                Button(actionTitle, action: action)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 20)
                    .frame(minHeight: 44)
                    .background(Theme.fill, in: Capsule())
                    .buttonStyle(PressScaleStyle())
            }
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Вопрос пользователя — пузырь справа.
private struct UserMessageView: View {
    @Environment(AppModel.self) private var model
    let message: FeedMessage
    let canEdit: Bool

    var body: some View {
        let images = message.attachments.filter { $0.kind == .image }
        let files = message.attachments.filter { $0.kind != .image }
        VStack(alignment: .trailing, spacing: 8) {
            if !images.isEmpty {
                AttachmentGrid(items: images)
            }
            if !files.isEmpty {
                VStack(alignment: .trailing, spacing: 6) {
                    ForEach(files) { file in
                        Label(file.name, systemImage: file.symbol)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 34)
                            .background(Theme.fill, in: Capsule())
                    }
                }
            }
            if !message.text.isEmpty {
                Text(message.text)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .contextMenu {
                        Button {
                            UIPasteboard.general.string = message.text
                        } label: {
                            Label("Скопировать", systemImage: "doc.on.doc")
                        }
                        if canEdit {
                            Button {
                                model.editing = message
                            } label: {
                                Label("Изменить", systemImage: "pencil")
                            }
                        }
                    }
            }
        }
        .padding(.leading, 44)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

/// Ответ модели — текст во всю ширину, без пузыря; снизу — действия.
private struct AssistantMessageView: View {
    @Environment(AppModel.self) private var model
    let message: FeedMessage
    let canRegenerate: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !message.reasoning.isEmpty {
                ReasoningView(text: message.reasoning)
            }
            if !message.blocks.isEmpty {
                MarkdownView(blocks: message.blocks)
            }
            ForEach(message.arts) { art in
                ArtView(art: art)
            }
            if !message.text.isEmpty || !message.arts.isEmpty {
                HStack(spacing: 4) {
                    if !message.text.isEmpty {
                        CopyButton(text: message.text, label: "Скопировать ответ")
                    }
                    if canRegenerate {
                        Button {
                            Task { await model.regenerate(message) }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Theme.muted)
                                .frame(width: 44, height: 40)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PressScaleStyle())
                        .accessibilityLabel("Ответить заново")
                    }
                    if !message.model.isEmpty {
                        Text(message.model)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.subtle)
                            .lineLimit(1)
                    }
                }
                .padding(.leading, -13)
                .padding(.top, -6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Размышления модели: свёрнуты, раскрываются по нажатию.
private struct ReasoningView: View {
    let text: String
    var title = "Размышления"
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                Haptics.tap()
                withAnimation(Theme.spring) { open.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.system(size: 15))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .rotationEffect(.degrees(open ? 90 : 0))
                }
                .foregroundStyle(Theme.muted)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityHint(open ? "Свернуть" : "Развернуть")

            if open {
                Text(text)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, 14)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Theme.fillActive).frame(width: 3)
                    }
                    .transition(.opacity)
            }
        }
        .padding(.top, -10)
    }
}
