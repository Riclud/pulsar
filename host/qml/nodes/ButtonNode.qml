import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Effects

Button {
    id: buttonRoot

    required property Window view
    property var pulsarMeta: null
    property var nodeData: null
    property string variant: "solid"
    property color fillColor: view.themePrimary
    property color labelColor: view.themeOnPrimary
    property int radius: view.themeRadius
    property string iconName: ""
    property string iconPosition: "left"
    property int pulsarElevation: 0
    property color pulsarShadowColor: view.themeShadow
    property bool colorAnimationReady: false

    Component.onCompleted: Qt.callLater(function () {
        buttonRoot.colorAnimationReady = true;
    })

    layer.enabled: view.effectsAvailable && buttonRoot.pulsarElevation > 0
    layer.effect: MultiEffect {
        shadowEnabled: true
        autoPaddingEnabled: true
        shadowColor: buttonRoot.pulsarShadowColor
        shadowBlur: Math.min(1, 0.2 + buttonRoot.pulsarElevation * 0.15)
        shadowOpacity: Math.min(0.5, 0.12 + buttonRoot.pulsarElevation * 0.04)
        shadowVerticalOffset: buttonRoot.pulsarElevation * 2
    }

    flat: true
    leftPadding: 16
    rightPadding: 16
    topPadding: 8
    bottomPadding: 8
    implicitHeight: 40
    opacity: enabled ? 1 : 0.45
    scale: down ? 0.98 : 1

    Behavior on scale {
        NumberAnimation {
            duration: view.motionFast
            easing.type: Easing.BezierSpline
            easing.bezierCurve: view.motionCurve
        }
    }

    HoverHandler {
        cursorShape: Qt.PointingHandCursor
    }

    onDownChanged: {
        if (!down)
            return;

        ripple.x = width / 2 - ripple.width / 2;
        ripple.y = height / 2 - ripple.height / 2;
        rippleAnim.restart();
    }

    ParallelAnimation {
        id: rippleAnim

        NumberAnimation {
            target: ripple
            property: "scale"
            from: 0.2
            to: 1
            duration: view.motionNormal
            easing.type: Easing.BezierSpline
            easing.bezierCurve: view.motionCurve
        }

        SequentialAnimation {
            PropertyAction {
                target: ripple
                property: "opacity"
                value: 0.28
            }

            NumberAnimation {
                target: ripple
                property: "opacity"
                to: 0
                duration: view.motionSlow
                easing.type: Easing.BezierSpline
                easing.bezierCurve: view.motionCurve
            }
        }
    }

    background: Rectangle {
        id: buttonBackground

        radius: buttonRoot.radius
        clip: true
        color: {
            if (!buttonRoot.enabled)
                return view.disabledColor(buttonRoot.fillColor);
            if (buttonRoot.variant === "outline" || buttonRoot.variant === "ghost")
                return buttonRoot.hovered ? view.withAlpha(buttonRoot.fillColor, 0.08) : "transparent";
            if (buttonRoot.variant === "soft")
                return view.withAlpha(buttonRoot.fillColor, buttonRoot.down ? 0.28 : buttonRoot.hovered ? 0.22 : 0.16);

            return buttonRoot.down ? view.activeColor(buttonRoot.fillColor)
                    : buttonRoot.hovered ? view.hoverColor(buttonRoot.fillColor)
                    : buttonRoot.fillColor;
        }
        border.width: buttonRoot.variant === "outline" ? 1 : 0
        border.color: buttonRoot.fillColor

        Behavior on color {
            enabled: buttonRoot.colorAnimationReady

            ColorAnimation {
                duration: view.motionFast
                easing.type: Easing.BezierSpline
                easing.bezierCurve: view.motionCurve
            }
        }

        Rectangle {
            id: ripple

            width: buttonRoot.height * 1.8
            height: width
            radius: width / 2
            color: view.withAlpha(buttonRoot.labelColor, 0.22)
            opacity: 0
            scale: 0.2
        }
    }

    contentItem: RowLayout {
        spacing: buttonRoot.text.length > 0 ? 6 : 0

        Item {
            Layout.fillWidth: true
            visible: buttonRoot.text.length === 0
        }

        Label {
            visible: text.length > 0 && buttonRoot.iconPosition === "left"
            text: buttonRoot.iconName
            font.family: view.iconFamily
            font.pixelSize: view.fs(18)
            color: buttonRoot.labelColor
        }

        Label {
            Layout.fillWidth: buttonRoot.text.length > 0
            text: buttonRoot.text
            color: buttonRoot.labelColor
            font.family: view.fontFamily
            font.pixelSize: buttonRoot.font.pixelSize
            font.weight: buttonRoot.font.weight
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
        }

        Label {
            visible: text.length > 0 && buttonRoot.iconPosition === "right"
            text: buttonRoot.iconName
            font.family: view.iconFamily
            font.pixelSize: view.fs(18)
            color: buttonRoot.labelColor
        }

        Item {
            Layout.fillWidth: true
            visible: buttonRoot.text.length === 0
        }
    }
}
