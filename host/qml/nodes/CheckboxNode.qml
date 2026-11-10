import QtQuick
import QtQuick.Controls

CheckBox {
    id: checkboxRoot

    required property Window view
    property var pulsarMeta: null

    padding: 0
    spacing: 8
    implicitHeight: Math.round(26 * view.density)

    indicator: Rectangle {
        implicitWidth: Math.round(20 * view.density)
        implicitHeight: Math.round(20 * view.density)
        radius: Math.round(6 * view.density)
        x: checkboxRoot.text
                ? (checkboxRoot.mirrored ? checkboxRoot.width - width - checkboxRoot.rightPadding : checkboxRoot.leftPadding)
                : checkboxRoot.leftPadding + (checkboxRoot.availableWidth - width) / 2
        y: checkboxRoot.topPadding + (checkboxRoot.availableHeight - height) / 2
        color: checkboxRoot.checked
                ? view.themePrimary
                : checkboxRoot.hovered
                    ? view.withAlpha(view.themePrimary, 0.16)
                    : "transparent"
        border.width: 1
        border.color: checkboxRoot.checked || checkboxRoot.hovered ? view.themePrimary : view.themeBorder

        Behavior on color {
            ColorAnimation {
                duration: view.motionFast
            }
        }

        Text {
            anchors.centerIn: parent
            text: "check"
            visible: checkboxRoot.checked
            color: view.themeOnPrimary
            font.family: view.iconFamily
            font.pixelSize: Math.round(14 * view.density)
            opacity: checkboxRoot.checked ? 1 : 0
            scale: checkboxRoot.checked ? 1 : 0.7

            Behavior on opacity {
                NumberAnimation {
                    duration: view.motionFast
                }
            }

            Behavior on scale {
                NumberAnimation {
                    duration: view.motionFast
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }
            }
        }
    }

    contentItem: Label {
        leftPadding: checkboxRoot.indicator && !checkboxRoot.mirrored
                ? checkboxRoot.indicator.width + checkboxRoot.spacing : 0
        rightPadding: checkboxRoot.indicator && checkboxRoot.mirrored
                ? checkboxRoot.indicator.width + checkboxRoot.spacing : 0
        text: checkboxRoot.text
        font.family: view.fontFamily
        font.pixelSize: view.fs(15)
        color: view.themeText
        verticalAlignment: Text.AlignVCenter
    }
}
