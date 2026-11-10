import QtQuick
import Pulsar.Native
import QtQuick.Layouts

Flickable {
    id: gridFlick

    required property Window view

    maximumFlickVelocity: 8000

    Inertia {
        renderer: gridFlick.view
        flick: gridFlick
    }

    clip: true
    boundsBehavior: Flickable.StopAtBounds
    property var pulsarMeta: null
    property alias gridLayout: gridLayout

    contentWidth: width
    contentHeight: gridLayout.implicitHeight + 2 * gridLayout.padding

    GridLayout {
        id: gridLayout

        property var pulsarMeta: null
        property int padding: 0

        x: padding
        y: padding
        width: gridFlick.width - 2 * padding
        columns: 2
        columnSpacing: 8
        rowSpacing: 8
    }
}
