import QtQuick
import QtQuick.Effects

Rectangle {
    id: cardShadowHost

    required property Window view
    property int pulsarColorMs: 0

    Behavior on color {
        enabled: cardShadowHost.pulsarColorMs > 0

        ColorAnimation { duration: cardShadowHost.pulsarColorMs }
    }

    Behavior on border.color {
        enabled: cardShadowHost.pulsarColorMs > 0

        ColorAnimation { duration: cardShadowHost.pulsarColorMs }
    }

    border.width: 1
    property var pulsarMeta: null
    property int pulsarElevation: 0
    property color pulsarShadowColor: "#000000"
    layer.enabled: view.effectsAvailable && cardShadowHost.pulsarElevation > 0
    layer.effect: MultiEffect {
        shadowEnabled: true
        autoPaddingEnabled: true
        shadowColor: cardShadowHost.pulsarShadowColor
        shadowBlur: Math.min(1, 0.2 + cardShadowHost.pulsarElevation * 0.15)
        shadowOpacity: Math.min(0.5, 0.12 + cardShadowHost.pulsarElevation * 0.04)
        shadowVerticalOffset: cardShadowHost.pulsarElevation * 2
    }
}
