import QtQuick

Rectangle {
    id: skeletonRoot

    required property Window view
    property var pulsarMeta: null
    property string variant: "rect"
    property bool animated: true
    property int baseRadius: 8

    color: view.themeSurfaceVariant
    radius: variant === "circle" ? height / 2 : baseRadius

    SequentialAnimation on opacity {
        running: skeletonRoot.animated
        loops: Animation.Infinite

        NumberAnimation {
            to: 0.45
            duration: view.motionSlow
            easing.type: Easing.InOutSine
        }

        NumberAnimation {
            to: 1
            duration: view.motionSlow
            easing.type: Easing.InOutSine
        }
    }
}
