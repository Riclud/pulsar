import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    width: 960
    height: 640
    title: "Hello Pulsar"

    Column {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        Row {
            Rectangle {
                width: 100

                Text {
                    text: Store.name || ""
                }
            }

            spacing: 12
            Label {
                text: Store.greeting || ""
                anchors.verticalCenter: parent.verticalCenter
            }
            Button {
                text: "Reload photos"
                onClicked: Pulsar.emit("reloadPhotos", {})
            }
            Label {
                text: (Store.photos ? Store.photos.length : 0) + " photos"
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        GridView {
            width: parent.width
            height: parent.height - 44
            clip: true
            cellWidth: 200
            cellHeight: 150
            model: Store.photos
            delegate: Image {
                width: 190
                height: 140
                source: modelData.url
                fillMode: Image.PreserveAspectCrop
                asynchronous: true
                cache: true
                sourceSize.width: 190
                sourceSize.height: 140
            }
        }
    }

    Component.onCompleted: {
        Pulsar.ready.connect(function () {
            Pulsar.emit("greet", {
                name: "World"
            });
        });
    }
}
