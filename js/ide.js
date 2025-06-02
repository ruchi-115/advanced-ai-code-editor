import { IS_PUTER } from "./puter.js";

const API_KEY = ""; // Get yours at https://platform.sulu.sh/apis/judge0

const AUTH_HEADERS = API_KEY ? {
    "Authorization": `Bearer ${API_KEY}`
} : {};

const CE = "CE";
const EXTRA_CE = "EXTRA_CE";

const AUTHENTICATED_CE_BASE_URL = "https://judge0-ce.p.sulu.sh";
const AUTHENTICATED_EXTRA_CE_BASE_URL = "https://judge0-extra-ce.p.sulu.sh";

var AUTHENTICATED_BASE_URL = {};
AUTHENTICATED_BASE_URL[CE] = AUTHENTICATED_CE_BASE_URL;
AUTHENTICATED_BASE_URL[EXTRA_CE] = AUTHENTICATED_EXTRA_CE_BASE_URL;

const UNAUTHENTICATED_CE_BASE_URL = "https://ce.judge0.com";
const UNAUTHENTICATED_EXTRA_CE_BASE_URL = "https://extra-ce.judge0.com";

var UNAUTHENTICATED_BASE_URL = {};
UNAUTHENTICATED_BASE_URL[CE] = UNAUTHENTICATED_CE_BASE_URL;
UNAUTHENTICATED_BASE_URL[EXTRA_CE] = UNAUTHENTICATED_EXTRA_CE_BASE_URL;

const INITIAL_WAIT_TIME_MS = 0;
const WAIT_TIME_FUNCTION = i => 100;
const MAX_PROBE_REQUESTS = 50;

var fontSize = 13;

var layout;

var sourceEditor;
var stdinEditor;
var stdoutEditor;

var $selectLanguage;
var $compilerOptions;
var $commandLineArguments;
var $runBtn;
var $statusLine;

var timeStart;

var sqliteAdditionalFiles;
var languages = {};

var layoutConfig = {
    settings: {
        showPopoutIcon: false,
        reorderEnabled: true
    },
    content: [{
        type: "row",
        content: [{
            type: "component",
            width: 60,
            componentName: "source",
            id: "source",
            title: "Source Code",
            isClosable: false,
            componentState: {
                readOnly: false
            }
        }, {
            type: "column",
            width: 25,
            content: [{
                type: "component",
                componentName: "stdin",
                id: "stdin",
                title: "Input",
                isClosable: false,
                componentState: {
                    readOnly: false
                }
            }, {
                type: "component",
                componentName: "stdout",
                id: "stdout",
                title: "Output",
                isClosable: false,
                componentState: {
                    readOnly: true
                }
            }]
        }, {
            type: "component",
            width: 15,
            componentName: "chat",
            id: "chat",
            title: "Chat",
            isClosable: false
        }]
    }]
};

var gPuterFile;

// Add keyboard shortcut constant
const POPUP_SHORTCUT = navigator.platform.includes('Mac') ? 'Meta+e' : 'Ctrl+E';

// Add selection tracking
var lastSelection = null;
var lastSelectionText = '';

function encode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

function decode(bytes) {
    var escaped = escape(atob(bytes || ""));
    try {
        return decodeURIComponent(escaped);
    } catch {
        return unescape(escaped);
    }
}

function showError(title, content) {
    $("#judge0-site-modal #title").html(title);
    $("#judge0-site-modal .content").html(content);

    let reportTitle = encodeURIComponent(`Error on ${window.location.href}`);
    let reportBody = encodeURIComponent(
        `**Error Title**: ${title}\n` +
        `**Error Timestamp**: \`${new Date()}\`\n` +
        `**Origin**: ${window.location.href}\n` +
        `**Description**:\n${content}`
    );

    $("#report-problem-btn").attr("href", `https://github.com/judge0/ide/issues/new?title=${reportTitle}&body=${reportBody}`);
    $("#judge0-site-modal").modal("show");
}

function showHttpError(jqXHR) {
    showError(`${jqXHR.statusText} (${jqXHR.status})`, `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`);
}

function handleRunError(jqXHR) {
    showHttpError(jqXHR);
    $runBtn.removeClass("disabled");

    window.top.postMessage(JSON.parse(JSON.stringify({
        event: "runError",
        data: jqXHR
    })), "*");
}

function handleResult(data) {
    const tat = Math.round(performance.now() - timeStart);
    console.log(`It took ${tat}ms to get submission result.`);

    const status = data.status;
    const stdout = decode(data.stdout);
    const compileOutput = decode(data.compile_output);
    const time = (data.time === null ? "-" : data.time + "s");
    const memory = (data.memory === null ? "-" : data.memory + "KB");

    $statusLine.html(`${status.description}, ${time}, ${memory} (TAT: ${tat}ms)`);

    const output = [compileOutput, stdout].join("\n").trim();

    stdoutEditor.setValue(output);

    $runBtn.removeClass("disabled");

    window.top.postMessage(JSON.parse(JSON.stringify({
        event: "postExecution",
        status: data.status,
        time: data.time,
        memory: data.memory,
        output: output
    })), "*");
}

async function getSelectedLanguage() {
    return getLanguage(getSelectedLanguageFlavor(), getSelectedLanguageId())
}

function getSelectedLanguageId() {
    return parseInt($selectLanguage.val());
}

function getSelectedLanguageFlavor() {
    return $selectLanguage.find(":selected").attr("flavor");
}

function run() {
    if (sourceEditor.getValue().trim() === "") {
        showError("Error", "Source code can't be empty!");
        return;
    } else {
        $runBtn.addClass("disabled");
    }

    stdoutEditor.setValue("");
    $statusLine.html("");

    let x = layout.root.getItemsById("stdout")[0];
    x.parent.header.parent.setActiveContentItem(x);

    let sourceValue = encode(sourceEditor.getValue());
    let stdinValue = encode(stdinEditor.getValue());
    let languageId = getSelectedLanguageId();
    let compilerOptions = $compilerOptions.val();
    let commandLineArguments = $commandLineArguments.val();

    let flavor = getSelectedLanguageFlavor();

    if (languageId === 44) {
        sourceValue = sourceEditor.getValue();
    }

    let data = {
        source_code: sourceValue,
        language_id: languageId,
        stdin: stdinValue,
        compiler_options: compilerOptions,
        command_line_arguments: commandLineArguments,
        redirect_stderr_to_stdout: true
    };

    let sendRequest = function (data) {
        window.top.postMessage(JSON.parse(JSON.stringify({
            event: "preExecution",
            source_code: sourceEditor.getValue(),
            language_id: languageId,
            flavor: flavor,
            stdin: stdinEditor.getValue(),
            compiler_options: compilerOptions,
            command_line_arguments: commandLineArguments
        })), "*");

        timeStart = performance.now();
        $.ajax({
            url: `${AUTHENTICATED_BASE_URL[flavor]}/submissions?base64_encoded=true&wait=false`,
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify(data),
            headers: AUTH_HEADERS,
            success: function (data, textStatus, request) {
                console.log(`Your submission token is: ${data.token}`);
                let region = request.getResponseHeader('X-Judge0-Region');
                setTimeout(fetchSubmission.bind(null, flavor, region, data.token, 1), INITIAL_WAIT_TIME_MS);
            },
            error: handleRunError
        });
    }

    if (languageId === 82) {
        if (!sqliteAdditionalFiles) {
            $.ajax({
                url: `./data/additional_files_zip_base64.txt`,
                contentType: "text/plain",
                success: function (responseData) {
                    sqliteAdditionalFiles = responseData;
                    data["additional_files"] = sqliteAdditionalFiles;
                    sendRequest(data);
                },
                error: handleRunError
            });
        }
        else {
            data["additional_files"] = sqliteAdditionalFiles;
            sendRequest(data);
        }
    } else {
        sendRequest(data);
    }
}

function fetchSubmission(flavor, region, submission_token, iteration) {
    if (iteration >= MAX_PROBE_REQUESTS) {
        handleRunError({
            statusText: "Maximum number of probe requests reached.",
            status: 504
        }, null, null);
        return;
    }

    $.ajax({
        url: `${UNAUTHENTICATED_BASE_URL[flavor]}/submissions/${submission_token}?base64_encoded=true`,
        headers: {
            "X-Judge0-Region": region
        },
        success: function (data) {
            if (data.status.id <= 2) { // In Queue or Processing
                $statusLine.html(data.status.description);
                setTimeout(fetchSubmission.bind(null, flavor, region, submission_token, iteration + 1), WAIT_TIME_FUNCTION(iteration));
            } else {
                handleResult(data);
            }
        },
        error: handleRunError
    });
}

function setSourceCodeName(name) {
    $(".lm_title")[0].innerText = name;
}

function getSourceCodeName() {
    return $(".lm_title")[0].innerText;
}

function openFile(content, filename) {
    clear();
    sourceEditor.setValue(content);
    selectLanguageForExtension(filename.split(".").pop());
    setSourceCodeName(filename);
}

function saveFile(content, filename) {
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

async function openAction() {
    if (IS_PUTER) {
        gPuterFile = await puter.ui.showOpenFilePicker();
        openFile(await (await gPuterFile.read()).text(), gPuterFile.name);
    } else {
        document.getElementById("open-file-input").click();
    }
}

async function saveAction() {
    if (IS_PUTER) {
        if (gPuterFile) {
            gPuterFile.write(sourceEditor.getValue());
        } else {
            gPuterFile = await puter.ui.showSaveFilePicker(sourceEditor.getValue(), getSourceCodeName());
            setSourceCodeName(gPuterFile.name);
        }
    } else {
        saveFile(sourceEditor.getValue(), getSourceCodeName());
    }
}

function setFontSizeForAllEditors(fontSize) {
    sourceEditor.updateOptions({ fontSize: fontSize });
    stdinEditor.updateOptions({ fontSize: fontSize });
    stdoutEditor.updateOptions({ fontSize: fontSize });
}

async function loadLangauges() {
    return new Promise((resolve, reject) => {
        let options = [];

        $.ajax({
            url: UNAUTHENTICATED_CE_BASE_URL + "/languages",
            success: function (data) {
                for (let i = 0; i < data.length; i++) {
                    let language = data[i];
                    let option = new Option(language.name, language.id);
                    option.setAttribute("flavor", CE);
                    option.setAttribute("langauge_mode", getEditorLanguageMode(language.name));

                    if (language.id !== 89) {
                        options.push(option);
                    }

                    if (language.id === DEFAULT_LANGUAGE_ID) {
                        option.selected = true;
                    }
                }
            },
            error: reject
        }).always(function () {
            $.ajax({
                url: UNAUTHENTICATED_EXTRA_CE_BASE_URL + "/languages",
                success: function (data) {
                    for (let i = 0; i < data.length; i++) {
                        let language = data[i];
                        let option = new Option(language.name, language.id);
                        option.setAttribute("flavor", EXTRA_CE);
                        option.setAttribute("langauge_mode", getEditorLanguageMode(language.name));

                        if (options.findIndex((t) => (t.text === option.text)) === -1 && language.id !== 89) {
                            options.push(option);
                        }
                    }
                },
                error: reject
            }).always(function () {
                options.sort((a, b) => a.text.localeCompare(b.text));
                $selectLanguage.append(options);
                resolve();
            });
        });
    });
};

async function loadSelectedLanguage(skipSetDefaultSourceCodeName = false) {
    monaco.editor.setModelLanguage(sourceEditor.getModel(), $selectLanguage.find(":selected").attr("langauge_mode"));

    if (!skipSetDefaultSourceCodeName) {
        setSourceCodeName((await getSelectedLanguage()).source_file);
    }
}

function selectLanguageByFlavorAndId(languageId, flavor) {
    let option = $selectLanguage.find(`[value=${languageId}][flavor=${flavor}]`);
    if (option.length) {
        option.prop("selected", true);
        $selectLanguage.trigger("change", { skipSetDefaultSourceCodeName: true });
    }
}

function selectLanguageForExtension(extension) {
    let language = getLanguageForExtension(extension);
    selectLanguageByFlavorAndId(language.language_id, language.flavor);
}

async function getLanguage(flavor, languageId) {
    return new Promise((resolve, reject) => {
        if (languages[flavor] && languages[flavor][languageId]) {
            resolve(languages[flavor][languageId]);
            return;
        }

        $.ajax({
            url: `${UNAUTHENTICATED_BASE_URL[flavor]}/languages/${languageId}`,
            success: function (data) {
                if (!languages[flavor]) {
                    languages[flavor] = {};
                }

                languages[flavor][languageId] = data;
                resolve(data);
            },
            error: reject
        });
    });
}

function setDefaults() {
    setFontSizeForAllEditors(fontSize);
    sourceEditor.setValue(DEFAULT_SOURCE);
    stdinEditor.setValue(DEFAULT_STDIN);
    $compilerOptions.val(DEFAULT_COMPILER_OPTIONS);
    $commandLineArguments.val(DEFAULT_CMD_ARGUMENTS);

    $statusLine.html("");

    loadSelectedLanguage();
}

function clear() {
    sourceEditor.setValue("");
    stdinEditor.setValue("");
    $compilerOptions.val("");
    $commandLineArguments.val("");

    $statusLine.html("");
}

function refreshSiteContentHeight() {
    const navigationHeight = document.getElementById("judge0-site-navigation").offsetHeight;

    const siteContent = document.getElementById("judge0-site-content");
    siteContent.style.height = `${window.innerHeight}px`;
    siteContent.style.paddingTop = `${navigationHeight}px`;
}

function refreshLayoutSize() {
    refreshSiteContentHeight();
    layout.updateSize();
}

window.addEventListener("resize", refreshLayoutSize);
document.addEventListener("DOMContentLoaded", async function () {
    $("#select-language").dropdown();
    $("[data-content]").popup({
        lastResort: "left center"
    });

    refreshSiteContentHeight();

    console.log("Hey, Judge0 IDE is open-sourced: https://github.com/judge0/ide. Have fun!");

    $selectLanguage = $("#select-language");
    $selectLanguage.change(function (event, data) {
        let skipSetDefaultSourceCodeName = (data && data.skipSetDefaultSourceCodeName) || !!gPuterFile;
        loadSelectedLanguage(skipSetDefaultSourceCodeName);
    });

    await loadLangauges();

    $compilerOptions = $("#compiler-options");
    $commandLineArguments = $("#command-line-arguments");

    $runBtn = $("#run-btn");
    $runBtn.click(run);

    $("#open-file-input").change(function (e) {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            const reader = new FileReader();
            reader.onload = function (e) {
                openFile(e.target.result, selectedFile.name);
            };

            reader.onerror = function (e) {
                showError("Error", "Error reading file: " + e.target.error);
            };

            reader.readAsText(selectedFile);
        }
    });

    $statusLine = $("#judge0-status-line");

    $(document).on("keydown", "body", function (e) {
        if (e.metaKey || e.ctrlKey) {
            switch (e.key) {
                case "Enter": // Ctrl+Enter, Cmd+Enter
                    e.preventDefault();
                    run();
                    break;
                case "s": // Ctrl+S, Cmd+S
                    e.preventDefault();
                    save();
                    break;
                case "o": // Ctrl+O, Cmd+O
                    e.preventDefault();
                    open();
                    break;
                case "+": // Ctrl+Plus
                case "=": // Some layouts use '=' for '+'
                    e.preventDefault();
                    fontSize += 1;
                    setFontSizeForAllEditors(fontSize);
                    break;
                case "-": // Ctrl+Minus
                    e.preventDefault();
                    fontSize -= 1;
                    setFontSizeForAllEditors(fontSize);
                    break;
                case "0": // Ctrl+0
                    e.preventDefault();
                    fontSize = 13;
                    setFontSizeForAllEditors(fontSize);
                    break;
            }
        }
    });

    require(["vs/editor/editor.main"], function (ignorable) {
        layout = new GoldenLayout(layoutConfig, $("#judge0-site-content"));

        let selectionActionBtn = null;

        function createSelectionButton() {
            if (!selectionActionBtn) {
                selectionActionBtn = document.createElement('button');
                selectionActionBtn.className = 'selection-action-btn';
                selectionActionBtn.setAttribute('type', 'button');
                document.body.appendChild(selectionActionBtn);
            }
            return selectionActionBtn;
        }

        function handleSelection(editor, showPopup = false) {
            const selection = editor.getSelection();
            if (!selection || selection.isEmpty()) {
                hideSelectionPopup();
                hideSelectionButton();
                return;
            }
            
            const selectedText = editor.getModel().getValueInRange(selection);
            if (!selectedText || !selectedText.trim()) {
                hideSelectionPopup();
                hideSelectionButton();
                return;
            }

            // Store selection for later use
            lastSelection = selection;
            lastSelectionText = selectedText;

            // Only show popup if explicitly requested
            if (showPopup) {
                const startPos = selection.getStartPosition();
                const endPos = selection.getEndPosition();
                const startCoords = editor.getScrolledVisiblePosition(startPos);
                
                const editorContainer = editor.getDomNode();
                const rect = editorContainer.getBoundingClientRect();
                
                showSelectionPopup(
                    rect.left + startCoords.left,
                    rect.top + startCoords.top - 10,
                    selection.startLineNumber,
                    selection.endLineNumber
                );
            } else {
                // Show the floating action button instead
                const endPos = selection.getEndPosition();
                const endCoords = editor.getScrolledVisiblePosition(endPos);
                
                const editorContainer = editor.getDomNode();
                const rect = editorContainer.getBoundingClientRect();
                
                showSelectionButton(
                    rect.left + endCoords.left + 10,
                    rect.top + endCoords.top
                );
            }
        }

        function showSelectionButton(x, y) {
            const btn = createSelectionButton();
            btn.style.left = `${x}px`;
            btn.style.top = `${y}px`;
            btn.style.display = 'block';
            btn.onclick = () => {
                hideSelectionButton();
                handleSelection(sourceEditor, true);
            };
        }

        function hideSelectionButton() {
            const btn = document.querySelector('.selection-action-btn');
            if (btn) {
                btn.style.display = 'none';
            }
        }

        function formatCodeBlock(code, language = '') {
       // Escape HTML and clean up code block by trimming whitespace and normalizing line endings
            return escapeHtml(code.trim().replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, ''));
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function detectLanguage(code) {
            // Simple language detection based on common patterns
            if (code.includes('function') || code.includes('const') || code.includes('let')) return 'javascript';
            if (code.includes('class') && code.includes('def')) return 'python';
            if (code.includes('#include')) return 'cpp';
            if (code.includes('public class')) return 'java';
            return '';
        }

        function formatMarkdown(text) {
            // Basic markdown formatting
            return text
                // Code blocks with language
                .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => 
                    formatCodeBlock(code.trim(), lang || detectLanguage(code))
                )
                // Inline code
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                // Headers
                .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                // Bold
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // Italic
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                // Lists
                .replace(/^\s*[-*+]\s+(.*)$/gm, '<li>$1</li>')
                .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
                // Numbered lists
                .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
                .replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>')
                // Links
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
                // Blockquotes
                .replace(/^\>\s(.*)$/gm, '<blockquote>$1</blockquote>')
                // Paragraphs
                .replace(/^(?!<[hou]|<blockquote|<pre|<li).+$/gm, '<p>$&</p>')
                // Line breaks
                .replace(/\n\s*\n/g, '<br>');
        }

        function createSelectionPopup() {
            const popup = document.createElement('div');
            popup.className = 'selection-popup';
            popup.innerHTML = `
                <div class="selection-popup-header">
                    <span class="selection-icon">✨</span>
                    <span class="selection-text">Code Assistant</span>
                    <span class="line-info"></span>
                </div>
                <div class="selection-popup-input-container">
                    <input type="text" class="selection-popup-input" placeholder="Ask a question or get code suggestions...">
                    <div class="input-actions">
                        <button class="selection-popup-btn ask-btn" title="Ask a question">
                            <i class="question circle icon"></i>
                            Ask
                        </button>
                        <button class="selection-popup-btn suggest-btn" title="Get code suggestions">
                            <i class="magic icon"></i>
                            Suggest
                        </button>
                    </div>
                </div>
                <div class="selection-popup-preview" style="display: none">
                    <div class="preview-header">
                        <span class="preview-title">
                            <i class="code icon"></i>
                            Code Suggestion
                        </span>
                    </div>
                    <div class="preview-content"></div>
                </div>
                <div class="selection-popup-hint">
                    <kbd>Enter</kbd> Ask &nbsp; <kbd>⇧ Enter</kbd> Suggest &nbsp; <kbd>Esc</kbd> Close
                </div>
            `;
            document.body.appendChild(popup);

            // Make the popup draggable
            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            const dragStart = (e) => {
                if (e.target.closest('.selection-popup-input') || e.target.closest('button')) {
                    return;
                }
                
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (e.target.closest('.selection-popup-header')) {
                    isDragging = true;
                }
            };

            const dragEnd = () => {
                isDragging = false;
            };

            const drag = (e) => {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    popup.style.transform = `translate(${currentX}px, ${currentY}px)`;
                }
            };

            popup.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            return popup;
        }

        function showSelectionPopup(x, y, startLine, endLine) {
            const popup = document.querySelector('.selection-popup') || createSelectionPopup();
            
            // Update line info
            const lineInfo = popup.querySelector('.line-info');
            lineInfo.textContent = `Lines ${startLine}-${endLine}`;
            
            // Position popup
            popup.style.left = `${x}px`;
            popup.style.top = `${y}px`;
            
            // Show popup with animation
            popup.classList.add('visible');
            
            // Setup event handlers
            const input = popup.querySelector('.selection-popup-input');
            const askBtn = popup.querySelector('.ask-btn');
            const suggestBtn = popup.querySelector('.suggest-btn');
            const previewSection = popup.querySelector('.selection-popup-preview');
            
            input.focus();
            
            // Remove old event listeners
            input.onkeydown = null;
            askBtn.onclick = null;
            suggestBtn.onclick = null;
            
            // Add new event listeners
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    if (e.shiftKey) {
                        previewSection.style.display = 'block';
                        handleSuggestion(input.value, previewSection);
                    } else {
                        handleQuestion(input.value);
                    }
                } else if (e.key === 'Escape') {
                    hideSelectionPopup();
                }
                e.stopPropagation(); // Prevent editor from handling the key events
            };
            
            askBtn.onclick = () => handleQuestion(input.value);
            suggestBtn.onclick = () => {
                previewSection.style.display = 'block';
                handleSuggestion(input.value, previewSection);
            };

            // Prevent hiding when interacting with popup
            popup.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        }

        function hideSelectionPopup() {
            const popup = document.querySelector('.selection-popup');
            if (popup) {
                popup.classList.remove('visible');
            }
        }

        function handleQuestion(question) {
            if (!question.trim()) return;
            
            // Switch to chat panel
            const chatItem = layout.root.getItemsById('chat')[0];
            chatItem.parent.header.parent.setActiveContentItem(chatItem);
            
            // Get the chat input and send button
            const chatContainer = chatItem.element[0].querySelector('.chat-container');
            const chatInput = chatContainer.querySelector('.chat-input');
            const sendBtn = chatContainer.querySelector('.chat-send-btn');
            
            // Set the question and trigger send
            chatInput.value = question;
            sendBtn.click();
            
            // Hide the popup
            hideSelectionPopup();
        }

        function createSuggestionsProvider() {
            return {
                triggerCharacters: ['.', ' '],
                provideCompletionItems: async (model, position, context, token) => {
                    try {
                        const apiKey = localStorage.getItem('chat_api_key');
                        const selectedModel = localStorage.getItem('chat_model') || 'anthropic/claude-3-sonnet';
                        
                        if (!apiKey) {
                            return { suggestions: [] };
                        }

                        // Get current line and word
                        const lineContent = model.getLineContent(position.lineNumber);
                        const word = model.getWordAtPosition(position);
                        
                        // Check if this is a refactoring request
                        const isRefactorRequest = lineContent.toLowerCase().includes('refactor') || 
                                                lineContent.toLowerCase().includes('improve');

                        // Get any active markers (errors) at the current position
                        const markers = monaco.editor.getModelMarkers({ resource: model.uri })
                            .filter(marker => 
                                marker.severity === monaco.MarkerSeverity.Error &&
                                marker.startLineNumber <= position.lineNumber &&
                                marker.endLineNumber >= position.lineNumber
                            );

                        let suggestions = [];

                        // If there's a selection, provide improvement suggestions
                        const selection = sourceEditor.getSelection();
                        if (selection && !selection.isEmpty()) {
                            const selectedText = model.getValueInRange(selection);
                            const prompt = isRefactorRequest 
                                ? "Refactor and improve this code while maintaining its functionality."
                                : "Suggest improvements for this code. Keep the same functionality but make it better.";
                            
                            const message = `Given this code:
\`\`\`
${selectedText}
\`\`\`

${prompt}

Provide only the improved code. No explanations.`;

                            const response = await callAI(selectedModel, apiKey, message);
                            
                            suggestions.push({
                                label: isRefactorRequest ? 'Refactored Code' : 'AI Suggestion',
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                documentation: isRefactorRequest ? 'Refactored version of the selected code' : 'AI-suggested code improvement',
                                insertText: response.trim(),
                                range: selection,
                                sortText: '0'
                            });
                        }

                        // If there are errors, provide fix suggestions
                        if (markers.length > 0) {
                            const errorContext = markers.map(marker => ({
                                message: marker.message,
                                code: model.getValueInRange({
                                    startLineNumber: Math.max(1, marker.startLineNumber - 2),
                                    endLineNumber: Math.min(model.getLineCount(), marker.endLineNumber + 2),
                                    startColumn: 1,
                                    endColumn: model.getLineMaxColumn(marker.endLineNumber)
                                })
                            }));

                            const message = `Fix these errors in the code:
${errorContext.map(err => `Error: ${err.message}
Code context:
\`\`\`
${err.code}
\`\`\`
`).join('\n')}

Provide only the corrected code. No explanations.`;

                            const response = await callAI(selectedModel, apiKey, message);
                            
                            suggestions.push({
                                label: 'Fix Error',
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                documentation: 'AI-suggested fix for the current error',
                                insertText: response.trim(),
                                range: {
                                    startLineNumber: markers[0].startLineNumber,
                                    endLineNumber: markers[0].endLineNumber,
                                    startColumn: markers[0].startColumn,
                                    endColumn: markers[0].endColumn
                                },
                                sortText: '1'
                            });
                        }

                        // Always provide inline completions for the current line
                        if (word) {
                            const linePrefix = lineContent.substring(0, word.endColumn - 1);
                            const message = `Complete this line of code:
\`\`\`
${linePrefix}
\`\`\`

Provide only the completion. No explanations.`;

                            const response = await callAI(selectedModel, apiKey, message);
                            
                            suggestions.push({
                                label: 'Line Completion',
                                kind: monaco.languages.CompletionItemKind.Text,
                                documentation: 'AI-suggested line completion',
                                insertText: response.trim(),
                                range: {
                                    startLineNumber: position.lineNumber,
                                    endLineNumber: position.lineNumber,
                                    startColumn: word.endColumn,
                                    endColumn: word.endColumn
                                },
                                sortText: '2'
                            });
                        }

                        return { suggestions };
                    } catch (error) {
                        console.error('Error getting suggestions:', error);
                        return { suggestions: [] };
                    }
                }
            };
        }

        function createInlineCompletionsProvider() {
            return {
                provideInlineCompletions: async (model, position, context, token) => {
                    try {
                        const apiKey = localStorage.getItem('chat_api_key');
                        const selectedModel = localStorage.getItem('chat_model') || 'anthropic/claude-3-sonnet';
                        
                        if (!apiKey) {
                            return { items: [] };
                        }

                        // Get the current line and any errors
                        const lineContent = model.getLineContent(position.lineNumber);
                        const textUntilPosition = lineContent.substring(0, position.column - 1);
                        
                        // Check for errors in current line
                        const markers = monaco.editor.getModelMarkers({ resource: model.uri })
                            .filter(marker => 
                                marker.severity === monaco.MarkerSeverity.Error &&
                                marker.startLineNumber === position.lineNumber
                            );

                        let prompt = 'Complete this line of code:';
                        if (markers.length > 0) {
                            prompt = `Fix this error: ${markers[0].message}\nComplete this line of code:`;
                        }

                        const message = `${prompt}
\`\`\`
${textUntilPosition}
\`\`\`

Provide only the completion. No explanations.`;

                        const response = await callAI(selectedModel, apiKey, message);
                        
                        return {
                            items: [{
                                text: response.trim(),
                                range: {
                                    startLineNumber: position.lineNumber,
                                    startColumn: position.column,
                                    endLineNumber: position.lineNumber,
                                    endColumn: position.column
                                }
                            }]
                        };
                    } catch (error) {
                        console.error('Error getting inline completion:', error);
                        return { items: [] };
                    }
                }
            };
        }

        async function handleSuggestion(prompt, previewSection) {
            if (!prompt.trim()) return;

            const selection = sourceEditor.getSelection();
            if (!selection) return;

            try {
                const apiKey = localStorage.getItem('chat_api_key');
                const selectedModel = localStorage.getItem('chat_model') || 'anthropic/claude-3-sonnet';
                
                if (!apiKey) {
                    showError('Error', 'Please enter an API key in the chat panel first.');
                    return;
                }

                const selectedText = sourceEditor.getModel().getValueInRange(selection);
                
                const message = `Given this code:
\`\`\`
${selectedText}
\`\`\`

User request: ${prompt}

Provide only the improved/suggested code that should replace the selection. No explanations, just the code.`;

                // Show loading state
                previewSection.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><span>Generating suggestion...</span></div>';

                const response = await callAI(selectedModel, apiKey, message);
                
                if (response && typeof response === 'string') {
                    let cleanedResponse = response.trim();
                    const codeBlockMatch = cleanedResponse.match(/^```[\s\S]*?\n([\s\S]*?)\n```$/);
                    if (codeBlockMatch) {
                        cleanedResponse = codeBlockMatch[1].trim();
                    }
                    
                    // Clear loading state and create diff view
                    previewSection.innerHTML = '';
                    
                    // Create diff view with actions
                    const diffActions = createDiffViewWithActions(
                        previewSection,
                        selectedText,
                        cleanedResponse,
                        sourceEditor.getModel().getLanguageId()
                    );
                    
                    // Setup action handlers
                    diffActions.applyBtn.onclick = () => {
                        if (lastSelection) {
                            // Get the modified code
                            const finalCode = diffActions.diffView.getModifiedCode();
                            
                            sourceEditor.executeEdits('popup-suggestion', [{
                                range: lastSelection,
                                text: finalCode,
                                forceMoveMarkers: true
                            }]);
                            
                            diffActions.cleanup();
                            hideSelectionPopup();
                        }
                    };
                    
                    diffActions.cancelBtn.onclick = hideSelectionPopup;
                } else {
                    throw new Error('Invalid response format from AI');
                }
            } catch (error) {
                // Show error state
                previewSection.innerHTML = `<div class="error-message" style="color: var(--vscode-errorForeground, #f48771); padding: 12px;">${error.message}</div>`;
            }
        }

        layout.registerComponent("source", function (container, state) {
            sourceEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: true,
                readOnly: state.readOnly,
                language: "cpp",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: true
                },
                contextmenu: true,
                // Add actions to the editor's context menu
                contextMenuActionsProvider: () => {
                    return [
                        {
                            id: 'askAboutCode',
                            label: 'Ask About Code',
                            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE],
                            run: (editor) => {
                                handleSelection(editor, true);
                            }
                        }
                    ];
                }
            });

            // Register the suggestions provider
            const suggestionsDisposable = monaco.languages.registerCompletionItemProvider('*', createSuggestionsProvider());

            // Register the inline completions provider
            const inlineCompletionsDisposable = monaco.languages.registerInlineCompletionsProvider('*', createInlineCompletionsProvider());

            // Track selection changes
            sourceEditor.onDidChangeCursorSelection((e) => {
                // Only update the selection tracking, don't show popup
                if (!e.source) { // Only handle mouse/keyboard selection changes
                    handleSelection(sourceEditor, false);
                }
            });

            // Clean up providers when editor is disposed
            sourceEditor.onDidDispose(() => {
                suggestionsDisposable.dispose();
                inlineCompletionsDisposable.dispose();
            });

            // Only hide popup when clicking outside of it and the editor
            document.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.selection-popup') && 
                    !e.target.closest('.monaco-editor') && 
                    !e.target.closest('.selection-action-btn')) {
                    hideSelectionPopup();
                }
            });

            // Add keyboard shortcut for showing popup
            sourceEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
                const selection = sourceEditor.getSelection();
                if (selection && !selection.isEmpty()) {
                    handleSelection(sourceEditor, true);
                }
            });

            sourceEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
        });

        layout.registerComponent("stdin", function (container, state) {
            stdinEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: false
                }
            });
        });

        layout.registerComponent("stdout", function (container, state) {
            stdoutEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: false
                }
            });
        });

        layout.registerComponent("chat", function(container, state) {
            const $el = container.getElement();
            
            // Generate model options from configuration
            const modelOptions = Object.entries(AI_MODELS).flatMap(([provider, config]) =>
                Object.entries(config.models).map(([id, model]) => 
                    `<option value="${id}">${model.name}</option>`
                )
            ).join('');

            $el.html(`
                <div class="chat-container">
                    <div class="chat-header">
                        <select class="chat-model-select">
                            ${modelOptions}
                        </select>
                        <input type="password" class="chat-api-key" placeholder="Enter your API key">
                    </div>
                    <div class="selection-indicator"></div>
                    <div class="chat-messages"></div>
                    <div class="chat-input-container">
                        <input type="text" class="chat-input" placeholder="${lastSelection ? 'Ask about selected code...' : 'Ask here...'}">
                        <button class="chat-send-btn">Send</button>
                    </div>
                </div>
            `);

            const chatInput = $el.find('.chat-input');
            const chatSend = $el.find('.chat-send-btn');
            const chatMessages = $el.find('.chat-messages');
            const modelSelect = $el.find('.chat-model-select');
            const apiKeyInput = $el.find('.chat-api-key');
            const selectionIndicator = $el.find('.selection-indicator');

            function updateSelectionIndicator() {
                if (lastSelection && lastSelectionText) {
                    const lines = lastSelectionText.split('\n').length;
                    selectionIndicator.html(`
                        <div class="selection-info">
                            <span class="selection-icon">📎</span>
                            <span class="selection-text">
                                Selected: ${lines} line${lines > 1 ? 's' : ''} 
                                (${lastSelection.startLineNumber}-${lastSelection.endLineNumber})
                            </span>
                            <button class="clear-selection">×</button>
                        </div>
                    `).show();
                } else {
                    selectionIndicator.empty().hide();
                }
            }

            // Update selection indicator when selection changes
            sourceEditor.onDidChangeCursorSelection(() => {
                const selection = sourceEditor.getSelection();
                chatInput.attr('placeholder', selection && !selection.isEmpty() ? 'Ask about selected code...' : 'Ask here...');
                updateSelectionIndicator();
            });

            // Handle clear selection button
            selectionIndicator.on('click', '.clear-selection', () => {
                lastSelection = null;
                lastSelectionText = '';
                updateSelectionIndicator();
                chatInput.attr('placeholder', 'Ask here...');
            });

            // Initial update
            updateSelectionIndicator();

            // Load saved API key if exists
            const savedApiKey = localStorage.getItem('chat_api_key');
            if (savedApiKey) {
                apiKeyInput.val(savedApiKey);
            }

            // Load saved model if exists
            const savedModel = localStorage.getItem('chat_model');
            if (savedModel) {
                modelSelect.val(savedModel);
            }

            // Save API key when changed
            apiKeyInput.on('change', function() {
                const apiKey = $(this).val().trim();
                if (apiKey) {
                    localStorage.setItem('chat_api_key', apiKey);
                } else {
                    localStorage.removeItem('chat_api_key');
                }
            });

            // Save model when changed
            modelSelect.on('change', function() {
                localStorage.setItem('chat_model', $(this).val());
            });

            function addMessage(text, isUser = true) {
                const messageDiv = document.createElement('div');
                messageDiv.className = `chat-message ${isUser ? 'outgoing' : 'incoming'}`;
                
                if (isUser) {
                    messageDiv.textContent = text;
                } else {
                    // Format AI responses
                    messageDiv.innerHTML = formatMarkdown(text);
                    
                    // Handle code blocks
                    messageDiv.querySelectorAll('pre code').forEach(block => {
                        const codeContainer = block.parentElement;
                        
                        // Create actions container
                        const actionsDiv = document.createElement('div');
                        actionsDiv.className = 'code-actions';
                        
                        // Add apply button
                        const applyBtn = document.createElement('button');
                        applyBtn.className = 'code-action-btn apply';
                        applyBtn.innerHTML = '<i class="check icon"></i> Apply';
                        
                        actionsDiv.appendChild(applyBtn);
                        codeContainer.insertBefore(actionsDiv, block);
                        
                        applyBtn.onclick = () => {
                            if (lastSelection) {
                                sourceEditor.executeEdits('chat-suggestion', [{
                                    range: lastSelection,
                                    text: block.textContent,
                                    forceMoveMarkers: true
                                }]);
                            } else {
                                showError('Error', 'Please select the code you want to replace first.');
                            }
                        };
                        
                        // Apply syntax highlighting
                        if (window.hljs) {
                            hljs.highlightElement(block);
                        }
                    });
                }
                
                chatMessages[0].appendChild(messageDiv);
                chatMessages[0].scrollTop = chatMessages[0].scrollHeight;
            }

            chatSend.on('click', async () => {
                const message = chatInput.val().trim();
                const apiKey = apiKeyInput.val().trim();
                const model = modelSelect.val();

                if (!apiKey) {
                    addMessage('Please enter an API key first.', false);
                    return;
                }

                if (message) {
                    // Show the user's message
                    addMessage(message, true);
                    chatInput.val('');
                    
                    // Show thinking message
                    const thinkingMessage = `Thinking... (using ${model})`;
                    addMessage(thinkingMessage, false);

                    try {
                        const response = await callAI(model, apiKey, message);
                        
                        // Replace thinking message with actual response
                        const lastMessage = chatMessages[0].lastElementChild;
                        lastMessage.innerHTML = formatMarkdown(response);
                        
                        // Apply syntax highlighting and add code actions
                        lastMessage.querySelectorAll('pre code').forEach(block => {
                            const codeContainer = block.parentElement;
                            const language = block.className.replace('language-', '');
                            
                            // Create actions container
                            const actionsDiv = document.createElement('div');
                            actionsDiv.className = 'code-actions';
                            
                            // Add apply button
                            const applyBtn = document.createElement('button');
                            applyBtn.className = 'code-action-btn apply';
                            applyBtn.innerHTML = '<i class="check icon"></i> Apply';
                            
                            actionsDiv.appendChild(applyBtn);
                            codeContainer.insertBefore(actionsDiv, block);
                            
                            applyBtn.onclick = () => {
                                if (lastSelection) {
                                    sourceEditor.executeEdits('chat-suggestion', [{
                                        range: lastSelection,
                                        text: block.textContent,
                                        forceMoveMarkers: true
                                    }]);
                                } else {
                                    showError('Error', 'Please select the code you want to replace first.');
                                }
                            };
                            
                            // Apply syntax highlighting
                            if (window.hljs) {
                                hljs.highlightElement(block);
                            }
                        });
                    } catch (error) {
                        // Replace thinking message with error
                        const lastMessage = chatMessages[0].lastElementChild;
                        lastMessage.textContent = `Error: ${error.message}`;
                        lastMessage.style.color = 'var(--vscode-errorForeground, #f48771)';
                    }
                }
            });

            chatInput.on('keypress', (e) => {
                if (e.key === 'Enter') {
                    chatSend.click();
                }
            });
        });

        layout.on("initialised", function () {
            setDefaults();
            refreshLayoutSize();
            window.top.postMessage({ event: "initialised" }, "*");
        });

        layout.init();
    });

    let superKey = "⌘";
    if (!/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
        superKey = "Ctrl";
    }

    [$runBtn].forEach(btn => {
        btn.attr("data-content", `${superKey}${btn.attr("data-content")}`);
    });

    document.querySelectorAll(".description").forEach(e => {
        e.innerText = `${superKey}${e.innerText}`;
    });

    if (IS_PUTER) {
        puter.ui.onLaunchedWithItems(async function (items) {
            gPuterFile = items[0];
            openFile(await (await gPuterFile.read()).text(), gPuterFile.name);
        });
    }

    document.getElementById("judge0-open-file-btn").addEventListener("click", openAction);
    document.getElementById("judge0-save-btn").addEventListener("click", saveAction);

    window.onmessage = function (e) {
        if (!e.data) {
            return;
        }

        if (e.data.action === "get") {
            window.top.postMessage(JSON.parse(JSON.stringify({
                event: "getResponse",
                source_code: sourceEditor.getValue(),
                language_id: getSelectedLanguageId(),
                flavor: getSelectedLanguageFlavor(),
                stdin: stdinEditor.getValue(),
                stdout: stdoutEditor.getValue(),
                compiler_options: $compilerOptions.val(),
                command_line_arguments: $commandLineArguments.val()
            })), "*");
        } else if (e.data.action === "set") {
            if (e.data.source_code) {
                sourceEditor.setValue(e.data.source_code);
            }
            if (e.data.language_id && e.data.flavor) {
                selectLanguageByFlavorAndId(e.data.language_id, e.data.flavor);
            }
            if (e.data.stdin) {
                stdinEditor.setValue(e.data.stdin);
            }
            if (e.data.stdout) {
                stdoutEditor.setValue(e.data.stdout);
            }
            if (e.data.compiler_options) {
                $compilerOptions.val(e.data.compiler_options);
            }
            if (e.data.command_line_arguments) {
                $commandLineArguments.val(e.data.command_line_arguments);
            }
            if (e.data.api_key) {
                AUTH_HEADERS["Authorization"] = `Bearer ${e.data.api_key}`;
            }
        }
    };
});

const DEFAULT_SOURCE = "\
#include <algorithm>\n\
#include <cstdint>\n\
#include <iostream>\n\
#include <limits>\n\
#include <set>\n\
#include <utility>\n\
#include <vector>\n\
\n\
using Vertex    = std::uint16_t;\n\
using Cost      = std::uint16_t;\n\
using Edge      = std::pair< Vertex, Cost >;\n\
using Graph     = std::vector< std::vector< Edge > >;\n\
using CostTable = std::vector< std::uint64_t >;\n\
\n\
constexpr auto kInfiniteCost{ std::numeric_limits< CostTable::value_type >::max() };\n\
\n\
auto dijkstra( Vertex const start, Vertex const end, Graph const & graph, CostTable & costTable )\n\
{\n\
    std::fill( costTable.begin(), costTable.end(), kInfiniteCost );\n\
    costTable[ start ] = 0;\n\
\n\
    std::set< std::pair< CostTable::value_type, Vertex > > minHeap;\n\
    minHeap.emplace( 0, start );\n\
\n\
    while ( !minHeap.empty() )\n\
    {\n\
        auto const vertexCost{ minHeap.begin()->first  };\n\
        auto const vertex    { minHeap.begin()->second };\n\
\n\
        minHeap.erase( minHeap.begin() );\n\
\n\
        if ( vertex == end )\n\
        {\n\
            break;\n\
        }\n\
\n\
        for ( auto const & neighbourEdge : graph[ vertex ] )\n\
        {\n\
            auto const & neighbour{ neighbourEdge.first };\n\
            auto const & cost{ neighbourEdge.second };\n\
\n\
            if ( costTable[ neighbour ] > vertexCost + cost )\n\
            {\n\
                minHeap.erase( { costTable[ neighbour ], neighbour } );\n\
                costTable[ neighbour ] = vertexCost + cost;\n\
                minHeap.emplace( costTable[ neighbour ], neighbour );\n\
            }\n\
        }\n\
    }\n\
\n\
    return costTable[ end ];\n\
}\n\
\n\
int main()\n\
{\n\
    constexpr std::uint16_t maxVertices{ 10000 };\n\
\n\
    Graph     graph    ( maxVertices );\n\
    CostTable costTable( maxVertices );\n\
\n\
    std::uint16_t testCases;\n\
    std::cin >> testCases;\n\
\n\
    while ( testCases-- > 0 )\n\
    {\n\
        for ( auto i{ 0 }; i < maxVertices; ++i )\n\
        {\n\
            graph[ i ].clear();\n\
        }\n\
\n\
        std::uint16_t numberOfVertices;\n\
        std::uint16_t numberOfEdges;\n\
\n\
        std::cin >> numberOfVertices >> numberOfEdges;\n\
\n\
        for ( auto i{ 0 }; i < numberOfEdges; ++i )\n\
        {\n\
            Vertex from;\n\
            Vertex to;\n\
            Cost   cost;\n\
\n\
            std::cin >> from >> to >> cost;\n\
            graph[ from ].emplace_back( to, cost );\n\
        }\n\
\n\
        Vertex start;\n\
        Vertex end;\n\
\n\
        std::cin >> start >> end;\n\
\n\
        auto const result{ dijkstra( start, end, graph, costTable ) };\n\
\n\
        if ( result == kInfiniteCost )\n\
        {\n\
            std::cout << \"NO\\n\";\n\
        }\n\
        else\n\
        {\n\
            std::cout << result << '\\n';\n\
        }\n\
    }\n\
\n\
    return 0;\n\
}\n\
";

const DEFAULT_STDIN = "\
3\n\
3 2\n\
1 2 5\n\
2 3 7\n\
1 3\n\
3 3\n\
1 2 4\n\
1 3 7\n\
2 3 1\n\
1 3\n\
3 1\n\
1 2 4\n\
1 3\n\
";

const DEFAULT_COMPILER_OPTIONS = "";
const DEFAULT_CMD_ARGUMENTS = "";
const DEFAULT_LANGUAGE_ID = 105; // C++ (GCC 14.1.0) (https://ce.judge0.com/languages/105)

function getEditorLanguageMode(languageName) {
    const DEFAULT_EDITOR_LANGUAGE_MODE = "plaintext";
    const LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE = {
        "Bash": "shell",
        "C": "c",
        "C3": "c",
        "C#": "csharp",
        "C++": "cpp",
        "Clojure": "clojure",
        "F#": "fsharp",
        "Go": "go",
        "Java": "java",
        "JavaScript": "javascript",
        "Kotlin": "kotlin",
        "Objective-C": "objective-c",
        "Pascal": "pascal",
        "Perl": "perl",
        "PHP": "php",
        "Python": "python",
        "R": "r",
        "Ruby": "ruby",
        "SQL": "sql",
        "Swift": "swift",
        "TypeScript": "typescript",
        "Visual Basic": "vb"
    }

    for (let key in LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE) {
        if (languageName.toLowerCase().startsWith(key.toLowerCase())) {
            return LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE[key];
        }
    }
    return DEFAULT_EDITOR_LANGUAGE_MODE;
}

const EXTENSIONS_TABLE = {
    "asm": { "flavor": CE, "language_id": 45 }, // Assembly (NASM 2.14.02)
    "c": { "flavor": CE, "language_id": 103 }, // C (GCC 14.1.0)
    "cpp": { "flavor": CE, "language_id": 105 }, // C++ (GCC 14.1.0)
    "cs": { "flavor": EXTRA_CE, "language_id": 29 }, // C# (.NET Core SDK 7.0.400)
    "go": { "flavor": CE, "language_id": 95 }, // Go (1.18.5)
    "java": { "flavor": CE, "language_id": 91 }, // Java (JDK 17.0.6)
    "js": { "flavor": CE, "language_id": 102 }, // JavaScript (Node.js 22.08.0)
    "lua": { "flavor": CE, "language_id": 64 }, // Lua (5.3.5)
    "pas": { "flavor": CE, "language_id": 67 }, // Pascal (FPC 3.0.4)
    "php": { "flavor": CE, "language_id": 98 }, // PHP (8.3.11)
    "py": { "flavor": EXTRA_CE, "language_id": 25 }, // Python for ML (3.11.2)
    "r": { "flavor": CE, "language_id": 99 }, // R (4.4.1)
    "rb": { "flavor": CE, "language_id": 72 }, // Ruby (2.7.0)
    "rs": { "flavor": CE, "language_id": 73 }, // Rust (1.40.0)
    "scala": { "flavor": CE, "language_id": 81 }, // Scala (2.13.2)
    "sh": { "flavor": CE, "language_id": 46 }, // Bash (5.0.0)
    "swift": { "flavor": CE, "language_id": 83 }, // Swift (5.2.3)
    "ts": { "flavor": CE, "language_id": 101 }, // TypeScript (5.6.2)
    "txt": { "flavor": CE, "language_id": 43 }, // Plain Text
};

function getLanguageForExtension(extension) {
    return EXTENSIONS_TABLE[extension] || { "flavor": CE, "language_id": 43 }; // Plain Text (https://ce.judge0.com/languages/43)
}

const AI_MODELS = {
    'openrouter': {
        baseURL: 'https://openrouter.ai/api/v1/chat/completions',
        models: {
            'deepseek/deepseek-r1:free': {
                name: 'DeepSeek R1 (Free)',
                maxTokens: 4096
            },
            'google/gemini-2.0-flash-001': {
                name: 'Gemini 2.0 Flash',
                maxTokens: 4096
            },
            'google/gemini-2.0-pro': {
                name: 'Gemini 2.0 Pro',
                maxTokens: 4096
            },
            'anthropic/claude-3-opus': {
                name: 'Claude 3 Opus',
                maxTokens: 4096
            },
            'anthropic/claude-3-sonnet': {
                name: 'Claude 3 Sonnet',
                maxTokens: 4096
            },
            'meta-llama/llama-2-70b-chat': {
                name: 'Llama 2 70B',
                maxTokens: 4096
            },
            'mistral/mixtral-8x7b': {
                name: 'Mixtral 8x7B',
                maxTokens: 4096
            }
        },
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'Advanced AI Code Editor'
        }),
        prepareRequest: (model, message) => ({
            model: model,
            messages: [{
                role: 'user',
                content: message
            }],
            temperature: 0.7,
            max_tokens: 4096
        }),
        extractResponse: (data) => {
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Invalid response format from OpenRouter');
            }
            return data.choices[0].message.content;
        }
    }
};

async function callAI(model, apiKey, message) {
    try {
        const provider = Object.entries(AI_MODELS).find(([_, config]) => 
            Object.keys(config.models).includes(model)
        );

        if (!provider) {
            throw new Error(`Unsupported model: ${model}`);
        }

        const [providerName, config] = provider;
        
        // By default include context, unless message starts with /plain
        let fullMessage = message;
        if (!message.trim().startsWith('/plain')) {
            const context = gatherCodeContext();
            let contextMessage = `Context:
Language: ${context.language}

`;

            if (context.hasSelection) {
                contextMessage += `Selected code with surrounding context (lines ${context.selectionInfo.startLine}-${context.selectionInfo.endLine}):
\`\`\`${context.language.toLowerCase()}
${context.code}
\`\`\`
`;
            } else {
                contextMessage += `Full code:
\`\`\`${context.language.toLowerCase()}
${context.code}
\`\`\`
`;
            }

            if (context.input) {
                contextMessage += `\nInput:
\`\`\`
${context.input}
\`\`\`
`;
            }

            if (context.output) {
                contextMessage += `\nOutput:
\`\`\`
${context.output}
\`\`\`
`;
            }

            if (context.statusLine) {
                contextMessage += `\nStatus: ${context.statusLine}`;
            }

            if (context.compilerOptions) {
                contextMessage += `\nCompiler Options: ${context.compilerOptions}`;
            }

            fullMessage = contextMessage + `\nQuestion: ${message.trim()}`;
        } else {
            fullMessage = message.substring(6).trim();
        }

        const baseURL = typeof config.baseURL === 'function' 
            ? config.baseURL(apiKey) 
            : config.baseURL;

        const response = await fetch(baseURL, {
            method: 'POST',
            headers: config.headers(apiKey),
            body: JSON.stringify(config.prepareRequest(model, fullMessage))
        });

        if (!response.ok) {
            throw new Error(`${providerName} API error: ${response.statusText}`);
        }

        const data = await response.json();
        return config.extractResponse(data);
    } catch (error) {
        console.error(`${error.message}`);
        throw error;
    }
}

function gatherCodeContext() {
    // Get currently selected code and its position
    let selectedContext = {};
    
    // Use lastSelection if available
    if (lastSelection && lastSelectionText) {
        const model = sourceEditor.getModel();
        selectedContext = {
            code: lastSelectionText,
            startLine: lastSelection.startLineNumber,
            endLine: lastSelection.endLineNumber,
            totalLines: model.getLineCount()
        };
    }

    const context = {
        language: $selectLanguage.find(":selected").text(),
        input: stdinEditor.getValue(),
        output: stdoutEditor.getValue(),
        compilerOptions: $compilerOptions.val(),
        statusLine: $statusLine.html()
    };

    return {
        ...context,
        code: selectedContext.code || sourceEditor.getValue(),
        hasSelection: !!selectedContext.code,
        selectionInfo: selectedContext
    };
}

// Helper function to create diff view
function createDiffView(container, originalCode, newCode, language = 'plaintext') {
    // Create container for diff editor
    const diffContainer = document.createElement('div');
    diffContainer.className = 'diff-container';
    diffContainer.style.height = '300px';
    container.appendChild(diffContainer);
    
    // Create models for original and modified code
    const originalModel = monaco.editor.createModel(originalCode, language);
    const modifiedModel = monaco.editor.createModel(newCode, language);
    
    // Create diff editor
    const diffEditor = monaco.editor.createDiffEditor(diffContainer, {
        renderSideBySide: true,
        readOnly: true,
        minimap: { enabled: false },
        automaticLayout: true,
        theme: 'vs-dark',
        fontSize: 13,
        fontFamily: 'JetBrains Mono',
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on'
    });
    
    diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel
    });
    
    return {
        editor: diffEditor,
        getModifiedCode: () => modifiedModel.getValue(),
        cleanup: () => {
            originalModel.dispose();
            modifiedModel.dispose();
            diffEditor.dispose();
        }
    };
}

function createDiffViewWithActions(container, originalCode, newCode, language = 'plaintext') {
    // Create diff view container
    const diffViewContainer = document.createElement('div');
    diffViewContainer.className = 'diff-view-container';
    container.appendChild(diffViewContainer);
    
    // Create the diff view
    const diffView = createDiffView(
        diffViewContainer,
        originalCode,
        newCode,
        language
    );
    
    // Create actions container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'popup-actions';
    
    // Create apply button
    const applyBtn = document.createElement('button');
    applyBtn.className = 'popup-action-btn apply';
    applyBtn.innerHTML = '<i class="check icon"></i> Apply Changes';
    
    // Create cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'popup-action-btn cancel';
    cancelBtn.innerHTML = '<i class="times icon"></i> Cancel';
    
    // Add buttons to actions container
    actionsDiv.appendChild(applyBtn);
    actionsDiv.appendChild(cancelBtn);
    container.appendChild(actionsDiv);
    
    // Return cleanup and action handlers
    return {
        cleanup: () => {
            diffView.cleanup();
            container.removeChild(diffViewContainer);
            container.removeChild(actionsDiv);
        },
        applyBtn,
        cancelBtn,
        diffView
    };
}
