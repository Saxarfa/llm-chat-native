import SwiftUI

/// Плашка «Нет связи с ПК»: работают модели телефона и их чаты; кнопка — проверить связь сейчас.
struct OfflineBanner: View {
    @Environment(AppModel.self) private var model
    @State private var checking = false

    var body: some View {
        let onPhone = PhoneModelID.isPhone(model.activeModelID)
        HStack(spacing: 10) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.muted)
            Text(onPhone ? "Нет связи с ПК — отвечает модель телефона" : "Нет связи с ПК — выберите модель на телефоне")
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                Haptics.tap()
                checking = true
                Task {
                    await model.tryReconnect()
                    checking = false
                }
            } label: {
                Group {
                    if checking {
                        ProgressView().controlSize(.small).tint(Theme.muted)
                    } else {
                        Text("Проверить")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                    }
                }
                .frame(minWidth: 76, minHeight: 32)
                .background(Theme.fill, in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(PressScaleStyle())
            .disabled(checking)
            .accessibilityLabel("Проверить связь с ПК")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("offline.banner")
    }
}
