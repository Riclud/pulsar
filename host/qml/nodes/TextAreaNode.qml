import QtQuick
import QtQuick.Controls

TextArea {
    id: areaRoot

    required property Window view
    property var pulsarMeta: null
    property color fieldColor: view.themeSurfaceVariant
    property color fieldBorderColor: view.themeBorder
    property color fieldFocusColor: view.themePrimary
    property int fieldRadius: 8
    property bool outlined: false
    property Item floatingLabel: null

    color: view.themeText
    placeholderTextColor: view.themeTextSecondary
    selectionColor: view.themePrimary
    selectedTextColor: view.themeOnPrimary
    cursorDelegate: view.textCursorComponent
    font.family: view.fontFamily
    font.pixelSize: view.fs(14)
    leftPadding: 12
    rightPadding: 12
    topPadding: 14
    bottomPadding: 12
    wrapMode: TextEdit.Wrap

    Component.onCompleted: floatingLabel = view.findFloatingLabel(areaRoot)

    background: FieldBackground {
        control: areaRoot
        floatLabel: areaRoot.floatingLabel
        borderColor: areaRoot.fieldBorderColor
        focusColor: areaRoot.fieldFocusColor
        cornerRadius: areaRoot.fieldRadius
    }
}
