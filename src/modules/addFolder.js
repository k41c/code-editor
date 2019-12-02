import tag from 'html-tag-js';
import list from "../components/list";
import fs from "./utils/androidFileSystem";
import dialogs from "../components/dialogs";
import helpers from "./helpers";
import tile from "../components/tile";
import constants from "../constants";
import createEditorFromURI from "./createEditorFromURI";

export default addFolder;

function addFolder(folder, sidebar, index) {
    return new Promise(resolve => {

        if (folder.url in addedFolder) resolve();

        /**
         * @type {Manager}
         */
        const name = folder.name === 'File Browser' ? 'Home' : folder.name;
        const rootUrl = folder.url;
        const closeFolder = tag('span', {
            className: 'icon cancel'
        });
        const graph = [];
        let rootNode = list.collaspable(name, false, 'folder', {
            tail: closeFolder
        });
        rootNode.titleEl.type = 'dir';
        rootNode.titleEl.name = name;
        rootNode.titleEl.id = rootUrl;
        closeFolder.addEventListener('click', function () {
            if (rootNode.parentElement) {
                sidebar.removeChild(rootNode);
                rootNode = null;
            }
            const tmpFolders = {};
            for (let url in addedFolder) {
                if (url !== rootUrl) tmpFolders[url] = addedFolder[url];
            }
            addedFolder = tmpFolders;
            this.removeEvents();
        });
        rootNode.titleEl.addEventListener('contextmenu', function (e) {
            if (e.cancelable) {
                e.preventDefault();
            }
            navigator.vibrate(50);
            dialogs.select(name, [
                ['new folder', strings['new folder'], 'file-control folder-outline-add'],
                ['new file', strings['new file'], 'file-control document-add'],
                ['paste', strings.paste, 'file-control clipboard'],
                ['reload', strings.reload, 'loop']
            ]).then(res => {
                if (res === 'reload') {
                    reload();
                    return;
                }
                onSelect(res, this);
            });
        });

        plotFolder(rootUrl, rootNode);
        sidebar.append(rootNode);

        addedFolder[rootUrl] = {
            reload,
            name
        };

        function plotFolder(url, rootNode) {
            rootNode.clearList();
            fs.listDir(url).then(dirList => {
                dirList = helpers.sortDir(dirList, appSettings.value.fileBrowser);
                dirList.map(item => {
                    if (item.isDirectory) {
                        createFolderTile(rootNode, item);
                    } else {
                        createFileTile(rootNode, item);
                    }
                });
                resolve(index);
            }).catch(() => {
                rootNode.remove();
                delete addedFolder[rootUrl];
                resolve(index);
            });
            return rootNode;
        }

        function reload(url) {
            if (url && url in graph)
                return plotFolder(url, graph[url]);

            plotFolder(rootUrl, rootNode);
        }

        function createFileTile(rootNode, item) {
            const listItem = tile({
                lead: tag('span', {
                    className: helpers.getIconForFile(item.name),
                    style: {
                        paddingRight: '5px'
                    }
                }),
                text: item.name
            });
            listItem.type = 'file';
            listItem.id = item.nativeURL;
            listItem.name = item.name;
            listItem.addEventListener('click', function () {
                createEditorFromURI.bind()(this.id).then(() => {
                    sidebar.hide();
                });
            });
            listItem.addEventListener('contextmenu', function (e) {
                if (e.cancelable) {
                    e.preventDefault();
                }
                navigator.vibrate(50);
                dialogs.select(this.name, [
                    ['copy', strings.copy, 'file-control clipboard'],
                    ['cut', strings.cut, 'file-control edit-cut'],
                    ['delete', strings.delete, 'delete'],
                    ['rename', strings.rename, 'edit']
                ]).then(res => {
                    onSelect(res, this);
                });
            });
            rootNode.addListTile(listItem);
        }

        function createFolderTile(rootNode, item) {
            const name = item.name;
            const node = graph[item.nativeURL] || list.collaspable(name, true, 'folder');

            node.textConten = '';
            node.titleEl.type = 'dir';
            node.titleEl.id = item.nativeURL;
            node.titleEl.name = name;

            node.titleEl.oncontextmenu = function (e) {
                if (e.cancelable) {
                    e.preventDefault();
                }
                navigator.vibrate(50);
                dialogs.select(this.name, [
                    ['copy', strings.copy, 'file-control clipboard'],
                    ['cut', strings.cut, 'file-control edit-cut'],
                    ['new folder', strings['new folder'], 'file-control folder-outline-add'],
                    ['new file', strings['new file'], 'file-control document-add'],
                    ['paste', strings.paste, 'file-control clipboard'],
                    ['rename', strings.rename, 'edit'],
                    ['delete', strings['delete'], 'delete']
                ]).then(res => {
                    onSelect(res, this);
                });
            };
            graph[item.nativeURL] = node;
            rootNode.addListTile(plotFolder(item.nativeURL, node));
        }

        function onSelect(selectedOption, obj) {
            let timeout;
            switch (selectedOption) {

                case 'delete':
                    dialogs.confirm(strings.warning.toUpperCase(), strings['delete {name}'].replace('{name}', obj.name))
                        .then(() => {
                            fs.deleteFile(obj.id).then(() => {
                                window.plugins.toast.showShortBottom(strings["file deleted"]);
                                if (obj.type === 'dir') {
                                    deleteFolder(obj.parentElement.list);
                                } else {

                                    const editor = editorManager.getFile(obj.id);
                                    if (editor) {
                                        editorManager.removeFile(editor, true);
                                    }

                                    obj.remove();
                                    if (obj.id in graph) delete graph[obj.id];
                                }
                            }).catch(err => {
                                if (err.code) {
                                    alert(strings.error, `${strings['unable to delete file']}. ${helpers.getErrorMessage(err.code)}`);
                                }
                                console.error(err);
                            });
                        });
                    break;

                case 'rename':
                    dialogs.prompt(obj.type === 'file' ? strings['enter file name'] : strings['enter folder name'], obj.name, 'filename', {
                        required: true,
                        match: constants.FILE_NAME_REGEX
                    }).then(newname => {
                        fs.renameFile(obj.id, newname)
                            .then((parent) => {
                                success();
                                let newid = parent.nativeURL + encodeURI(newname);
                                if (obj.type === 'file') {

                                    const editor = editorManager.getFile(obj.id);
                                    if (editor) editor.filename = newname;

                                    obj.lead(tag('i', {
                                        className: helpers.getIconForFile(newname)
                                    }));
                                    obj.text(newname);

                                } else if (obj.type === 'dir') {
                                    newid += '/';
                                    const editors = editorManager.files;
                                    editors.map(ed => {
                                        if (ed.location === obj.id) {
                                            editorManager.updateLocation(ed, newid);
                                        }
                                    });
                                    obj.parentElement.text(newname);
                                }

                                obj.name = newname;
                                obj.id = newid;
                            })
                            .catch(error);
                    });
                    break;

                case 'copy':
                    updateCut();
                    fileClipBoard = {};
                    fileClipBoard.type = obj.type;
                    fileClipBoard.method = 'copy';
                    fileClipBoard.uri = obj.id;
                    break;

                case 'cut':
                    updateCut();
                    fileClipBoard = {};
                    fileClipBoard.type = obj.type;
                    fileClipBoard.method = 'cut';
                    fileClipBoard.uri = obj.id;
                    obj.classList.add('cut');
                    break;

                case 'paste':
                    if (!fileClipBoard) return;
                    const el = document.getElementById(fileClipBoard.uri);
                    window.resolveLocalFileSystemURL(fileClipBoard.uri, fs => {
                        window.resolveLocalFileSystemURL(obj.id, parent => {
                            obj = obj.parentElement;

                            window.resolveLocalFileSystemURL(parent.nativeURL + fs.name, res => {
                                dialogs.prompt(strings['enter file name'], fs.name, 'filename', {
                                        required: true,
                                        match: constants.FILE_NAME_REGEX
                                    })
                                    .then(res => {
                                        if (fileClipBoard.method === 'copy') {
                                            paste(el, fs, parent, 'copyTo', res);
                                        } else {
                                            paste(el, fs, parent, 'moveTo', res);
                                        }
                                    });
                            }, err => {
                                if (err.code === 1) {
                                    if (fileClipBoard.method === 'copy') {
                                        paste(el, fs, parent);
                                    } else {
                                        paste(el, fs, parent, 'moveTo');
                                    }
                                } else {
                                    alert(strings.error.toUpperCase(), strings.failed);
                                    document.body.classList.remove('loading');
                                }

                            });

                        }, error);
                    }, error);
                    break;

                case 'new file':
                case 'new folder':
                    const ask = selectedOption === 'new file' ? strings['enter file name'] : strings['enter folder name'];
                    dialogs.prompt(ask, selectedOption, 'filename', {
                        match: constants.FILE_NAME_REGEX,
                        required: true
                    }).then(filename => {
                        window.resolveLocalFileSystemURL(obj.id, fs => {
                            if (selectedOption === 'new folder') {
                                fs.getDirectory(filename, {
                                    create: true,
                                    exclusive: true
                                }, res => {
                                    success();
                                    reload(fs.nativeURL);
                                }, error);
                            } else {
                                fs.getFile(filename, {
                                    create: true,
                                    exclusive: true
                                }, res => {
                                    success();
                                    reload(fs.nativeURL);
                                }, error);
                            }
                        });
                    });
                    break;

                default:
                    break;
            }

            function paste(el, fs, parent, action = "copyTo", newname = null) {
                timeout = setTimeout(() => {
                    document.body.classList.add('loading');
                }, 100);
                fs[action](parent, newname, res => {
                    if (res.isFile) {
                        if (action === "moveTo") {
                            let editor = editorManager.getFile(fileClipBoard.uri);
                            if (editor) editorManager.removeFile(editor, true);
                            el.remove();
                        }
                        success();
                        createFileTile(obj, res);
                    } else {
                        success();
                        if (action === "moveTo") deleteFolder(el.parentElement.querySelector('ul'));
                        reload(parent.nativeURL);
                    }
                    clearTimeout(timeout);
                    document.body.classList.remove('loading');
                }, error);
            }

            function error(err) {
                alert(strings.error.toUpperCase(), `${strings.failed}, ${helpers.getErrorMessage(err.code)}`);
                if (timeout) clearTimeout(timeout);
                document.body.classList.remove('loading');
                console.log(err);
            }

            function success() {
                window.plugins.toast.showShortBottom(strings.success);
            }

            function deleteFolder(obj) {
                const children = obj.children;
                const length = obj.childElementCount;
                const listItems = [];
                for (let i = 0; i < length; ++i) {
                    listItems.push(children[i]);
                }

                listItems.map(item => {
                    const editor = editorManager.getFile(item.id || '');
                    if (editor) {
                        editorManager.removeFile(editor);
                    }
                });

                obj.parentElement.remove();
            }

            function updateCut() {
                if (fileClipBoard) {
                    let el = document.getElementById(fileClipBoard.uri);
                    if (el) el.classList.remove('cut');
                }
            }
        }

    });
}