import QtQuick
import QtQuick.Controls

RangeSlider {
    id: rangeRoot

    required property Window view
    property var pulsarMeta: null
    property var nodeData: null
    property bool expand: false

    implicitWidth: 200
    implicitHeight: 40
    snapMode: Slider.NoSnap

    palette.highlight: view.themePrimary
    palette.accent: view.themePrimary
    palette.windowText: view.themeText
    palette.text: view.themeText

    first.handle: Rectangle {
        x: rangeRoot.leftPadding + rangeRoot.first.visualPosition * (rangeRoot.availableWidth - width)
        y: rangeRoot.topPadding + (rangeRoot.availableHeight - height) / 2
        implicitWidth: 20
        implicitHeight: 20
        radius: 10
        color: view.themeSurface
        border.width: 2
        border.color: view.themePrimary
    }

    second.handle: Rectangle {
        x: rangeRoot.leftPadding + rangeRoot.second.visualPosition * (rangeRoot.availableWidth - width)
        y: rangeRoot.topPadding + (rangeRoot.availableHeight - height) / 2
        implicitWidth: 20
        implicitHeight: 20
        radius: 10
        color: view.themeSurface
        border.width: 2
        border.color: view.themePrimary
    }

    background: Rectangle {
        x: rangeRoot.leftPadding
        y: rangeRoot.topPadding + (rangeRoot.availableHeight - height) / 2
        implicitWidth: 200
        implicitHeight: 4
        width: rangeRoot.availableWidth
        height: implicitHeight
        radius: 2
        color: view.themeSurfaceVariant

        Rectangle {
            x: rangeRoot.first.position * parent.width
            width: rangeRoot.second.position * parent.width - rangeRoot.first.position * parent.width
            height: parent.height
            color: view.themePrimary
        }
    }
}
