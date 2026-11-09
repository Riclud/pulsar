import QtQuick
import QtQuick.Shapes

Item {
    id: fieldBackground

    property var control
    property Item floatLabel
    property color borderColor: "transparent"
    property color focusColor: "transparent"
    property int cornerRadius: 8

    readonly property real strokeWidth: control && control.activeFocus ? 2 : 1
    readonly property real inset: strokeWidth / 2
    readonly property real corner: Math.max(1, cornerRadius - inset)
    readonly property bool showBorder: control ? (control.outlined || control.activeFocus) : false
    readonly property bool labelFloating: floatLabel !== null && control !== null
            && control.placeholderText.length > 0
            && (control.length > 0 || control.activeFocus)
    readonly property real labelWidth: labelFloating
            ? Math.min(floatLabel.width, floatLabel.implicitWidth) * floatLabel.scale
            : 0
    readonly property real gapStart: labelFloating ? floatLabel.x - 3 : inset + corner
    readonly property real gapEnd: labelFloating ? floatLabel.x + labelWidth + 3 : inset + corner

    Rectangle {
        anchors.fill: parent
        color: fieldBackground.control ? fieldBackground.control.fieldColor : "transparent"
        radius: fieldBackground.cornerRadius
    }

    Shape {
        anchors.fill: parent
        visible: fieldBackground.showBorder
        antialiasing: true

        ShapePath {
            fillColor: "transparent"
            strokeColor: fieldBackground.control && fieldBackground.control.activeFocus
                    ? fieldBackground.focusColor
                    : fieldBackground.borderColor
            strokeWidth: fieldBackground.strokeWidth
            capStyle: ShapePath.FlatCap
            joinStyle: ShapePath.RoundJoin

            startX: fieldBackground.gapEnd
            startY: fieldBackground.inset

            PathLine {
                x: fieldBackground.width - fieldBackground.inset - fieldBackground.corner
                y: fieldBackground.inset
            }
            PathAngleArc {
                centerX: fieldBackground.width - fieldBackground.inset - fieldBackground.corner
                centerY: fieldBackground.inset + fieldBackground.corner
                radiusX: fieldBackground.corner
                radiusY: fieldBackground.corner
                startAngle: -90
                sweepAngle: 90
            }
            PathLine {
                x: fieldBackground.width - fieldBackground.inset
                y: fieldBackground.height - fieldBackground.inset - fieldBackground.corner
            }
            PathAngleArc {
                centerX: fieldBackground.width - fieldBackground.inset - fieldBackground.corner
                centerY: fieldBackground.height - fieldBackground.inset - fieldBackground.corner
                radiusX: fieldBackground.corner
                radiusY: fieldBackground.corner
                startAngle: 0
                sweepAngle: 90
            }
            PathLine {
                x: fieldBackground.inset + fieldBackground.corner
                y: fieldBackground.height - fieldBackground.inset
            }
            PathAngleArc {
                centerX: fieldBackground.inset + fieldBackground.corner
                centerY: fieldBackground.height - fieldBackground.inset - fieldBackground.corner
                radiusX: fieldBackground.corner
                radiusY: fieldBackground.corner
                startAngle: 90
                sweepAngle: 90
            }
            PathLine {
                x: fieldBackground.inset
                y: fieldBackground.inset + fieldBackground.corner
            }
            PathAngleArc {
                centerX: fieldBackground.inset + fieldBackground.corner
                centerY: fieldBackground.inset + fieldBackground.corner
                radiusX: fieldBackground.corner
                radiusY: fieldBackground.corner
                startAngle: 180
                sweepAngle: 90
            }
            PathLine {
                x: fieldBackground.gapStart
                y: fieldBackground.inset
            }
        }
    }
}
