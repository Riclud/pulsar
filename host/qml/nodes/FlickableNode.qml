import QtQuick

Flickable {
    id: scrollFlick

    required property Window view

    clip: true
    boundsBehavior: Flickable.StopAtBounds
    maximumFlickVelocity: 8000

    Inertia {
        renderer: view
        flick: scrollFlick
        stretch: true
    }

    rebound: Transition {
        NumberAnimation {
            properties: "x,y"
            duration: view.motionNormal
            easing.type: Easing.BezierSpline
            easing.bezierCurve: view.motionCurve
        }
    }

    property var pulsarMeta: null
}
