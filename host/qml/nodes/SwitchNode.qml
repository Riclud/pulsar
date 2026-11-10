import QtQuick
import QtQuick.Controls

Switch {
    id: switchRoot

    required property Window view
    property var pulsarMeta: null

    padding: 0
    implicitHeight: 30

    indicator: Item {
        implicitWidth: 52
        implicitHeight: 28
        x: switchRoot.text
                ? (switchRoot.mirrored ? switchRoot.width - width - switchRoot.rightPadding : switchRoot.leftPadding)
                : switchRoot.leftPadding + (switchRoot.availableWidth - width) / 2
        y: switchRoot.topPadding + (switchRoot.availableHeight - height) / 2

        Rectangle {
            id: switchTrack

            anchors.fill: parent
            radius: height / 2
            color: switchRoot.checked ? view.themePrimary : view.themeSurfaceVariant
            border.width: 1
            border.color: switchRoot.checked ? view.themePrimary : view.themeBorder

            Behavior on color {
                ColorAnimation {
                    duration: view.motionFast
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }
            }
        }

        Rectangle {
            id: switchThumb

            y: (parent.height - height) / 2
            width: switchRoot.pressed ? 24 : switchRoot.checked ? 20 : 14
            height: width
            radius: width / 2
            x: switchRoot.checked ? parent.width - 24 : 4
            color: switchRoot.checked ? view.themeOnPrimary : view.themeTextSecondary

            Behavior on x {
                NumberAnimation {
                    duration: view.motionFast
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }
            }

            Behavior on width {
                NumberAnimation {
                    duration: view.motionFast
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }
            }

            Behavior on color {
                ColorAnimation {
                    duration: view.motionFast
                }
            }
        }
    }

    contentItem: Label {
        leftPadding: switchRoot.indicator && !switchRoot.mirrored
                ? switchRoot.indicator.width + switchRoot.spacing : 0
        rightPadding: switchRoot.indicator && switchRoot.mirrored
                ? switchRoot.indicator.width + switchRoot.spacing : 0
        text: switchRoot.text
        font.family: view.fontFamily
        font.pixelSize: view.fs(15)
        color: view.themeText
        verticalAlignment: Text.AlignVCenter
    }
}
