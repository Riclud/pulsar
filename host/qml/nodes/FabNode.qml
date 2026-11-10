import QtQuick
import QtQuick.Controls
import QtQuick.Effects

Item {
    id: fabRoot

    required property Window view
    property var pulsarMeta: null
    property var nodeData: null
    property string iconName: ""
    property int fabSize: 56
    property bool floating: true
    property bool fabEnabled: true
    property color fabColor: view.themePrimary
    property color fabTextColor: view.themeOnPrimary
    property int pulsarElevation: 0
    property color pulsarShadowColor: view.themeShadow

    implicitWidth: fabSize
    implicitHeight: fabSize
    width: fabSize
    height: fabSize
    opacity: fabEnabled ? 1 : 0.45
    layer.enabled: view.effectsAvailable && pulsarElevation > 0

    layer.effect: MultiEffect {
        shadowEnabled: true
        autoPaddingEnabled: true
        shadowColor: fabRoot.pulsarShadowColor
        shadowBlur: Math.min(1, 0.2 + fabRoot.pulsarElevation * 0.15)
        shadowOpacity: Math.min(0.5, 0.12 + fabRoot.pulsarElevation * 0.04)
        shadowVerticalOffset: fabRoot.pulsarElevation * 2
    }

    onFloatingChanged: updateAnchors()

    function updateAnchors() {
        if (floating) {
            anchors.right = parent.right;
            anchors.bottom = parent.bottom;
            anchors.rightMargin = 24;
            anchors.bottomMargin = 24;
            return;
        }

        anchors.right = undefined;
        anchors.bottom = undefined;
    }

    Rectangle {
        id: fabCircle

        anchors.fill: parent
        radius: width / 2
        color: fabRoot.fabEnabled
                ? (fabMouse.pressed ? view.activeColor(fabRoot.fabColor)
                   : fabMouse.containsMouse ? view.hoverColor(fabRoot.fabColor) : fabRoot.fabColor)
                : view.disabledColor(fabRoot.fabColor)
        scale: fabMouse.pressed ? 0.94 : 1

        Behavior on color {
            ColorAnimation {
                duration: view.motionFast
                easing.type: Easing.BezierSpline
                easing.bezierCurve: view.motionCurve
            }
        }

        Behavior on scale {
            NumberAnimation {
                duration: view.motionFast
                easing.type: Easing.BezierSpline
                easing.bezierCurve: view.motionCurve
            }
        }

        Label {
            anchors.centerIn: parent
            text: fabRoot.iconName
            font.family: view.iconFamily
            font.pixelSize: view.fs(Math.round(fabRoot.fabSize * 0.43))
            color: fabRoot.fabTextColor
        }

        MouseArea {
            id: fabMouse

            anchors.fill: parent
            enabled: fabRoot.fabEnabled
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: view.emitNodeEvent(fabRoot.nodeData, "click")
        }
    }
}
