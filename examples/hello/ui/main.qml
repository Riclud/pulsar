import QtQuick
import QtQuick.Controls

ApplicationWindow {
    id: win
    visible: true
    width: 640
    height: 480
    title: "Hello Pulsar"

    function run(method, params) {
        status.text = method;
        Pulsar.call(method, params, function (result, error) {
            var pretty = typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2);
            if (error)
                pretty = "ERR " + JSON.stringify(error);
            log.text = pretty;
            console.log("[pulsar]", method, "=>", pretty.replace(/\n/g, "\\n").slice(0, 400));
        });
    }

    Column {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        Label { text: Store.greeting }

        Row {
            spacing: 8
            Label { text: "path:"; anchors.verticalCenter: parent.verticalCenter }
            TextField { id: pathField; text: "package.json"; width: 300 }
        }

        Row {
            spacing: 8
            Button { text: "greet"; onClicked: win.run("greet", { name: "Bob" }) }
            Button { text: "fs.readFile"; onClicked: win.run("fs.readFile", { path: pathField.text }) }
            Button { text: "fs.listDir"; onClicked: win.run("fs.listDir", { path: pathField.text || "." }) }
            Button { text: "zig.ping"; onClicked: win.run("zig.ping", {}) }
        }

        Row {
            spacing: 8
            Label { text: "url:"; anchors.verticalCenter: parent.verticalCenter }
            TextField { id: urlField; text: "https://example.com"; width: 300 }
            Button { text: "nw.fetch"; onClicked: win.run("nw.fetch", { url: urlField.text }) }
        }

        Label { id: status; text: "waiting" }

        TextArea {
            id: log
            width: parent.width
            height: parent.height - 176
            readOnly: true
            placeholderText: "result"
        }
    }

    Component.onCompleted: {
        Pulsar.ready.connect(function () {
            Pulsar.call("greet", { name: "World" }, function (result, error) {
                status.text = error ? "ERR" : String(result);
            });
        });
    }
}
