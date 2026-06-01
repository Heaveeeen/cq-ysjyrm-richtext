import * as vsc from 'vscode';

// const annotationReg = /\{[^\{\$\}]*?\$[^\{\$\}]*?\}/g;
// const boldReg = /\*\*.*?\*\*/g;
// const chineseQuoteReg = /“[^“”]*?”/g;
const validReg = /(\{[^\{\$\}]*?\$[^\{\$\}]*?\})|(\*\*.*?\*\*)|(“[^“”]*?”)|(‘[^‘’]*?’)/g;
const invalidCharReg = /[\{\$\}]|\*\*/g;
const warnQuoteReg = /[“”‘’]/g;
const warnEnQuoteButNoLetterReg = /("[^\p{Script=Latin}\p{Script=Cyrillic}]+")|('[^\p{Script=Latin}\p{Script=Cyrillic}]+')/gu;

export function activate(context: vsc.ExtensionContext) {
	const diagnosticCollection = vsc.languages.createDiagnosticCollection();

	function matchAllForDoc(options: {
		txt: string, doc: vsc.TextDocument, reg: RegExp,
		callback: ({ match, range }: { match: RegExpExecArray, range: vsc.Range }) => unknown,
	}) {
		const { txt, doc, reg, callback } = options;
		for (const match of txt.matchAll(reg)) {
			const startPos = doc.positionAt(match.index);
			const endPos = doc.positionAt(match.index + match[0].length);
			const range = new vsc.Range(startPos, endPos);
			callback({ match, range });
		}
	}

	async function findAndReportSyntaxErrorFromUri(uri: vsc.Uri) {
		if (uri.fsPath.endsWith("_bilingual.cqyr.txt") || !uri.fsPath.endsWith(".cqyr.txt")) { return; }
		const diagnostics: vsc.Diagnostic[] = [];
		const doc = await vsc.workspace.openTextDocument(uri);
		const txt = doc.getText().replace(validReg, sub => " ".repeat(sub.length));

		matchAllForDoc({ txt, doc, reg: invalidCharReg, callback: ({ match, range }) => {
			diagnostics.push(new vsc.Diagnostic(
				range,
				`CQYR: 非法字符 "${match[0]}"。\n位于 ${uri.fsPath}:${range.start.line + 1}:${range.start.character + 1}`,
				vsc.DiagnosticSeverity.Error
			));
		}, });

		matchAllForDoc({ txt, doc, reg: warnQuoteReg, callback: ({ match, range }) => {
			diagnostics.push(new vsc.Diagnostic(
				range,
				`CQYR: 引号不匹配 "${match[0]}"。\n位于 ${uri.fsPath}:${range.start.line + 1}:${range.start.character + 1}`,
				vsc.DiagnosticSeverity.Warning
			));
		}, });

		matchAllForDoc({ txt, doc, reg: warnEnQuoteButNoLetterReg, callback: ({ match, range }) => {
			diagnostics.push(new vsc.Diagnostic(
				range,
				`CQYR: 半角引号序列 ${match[0]} 中不包含拉丁字母或西里尔字母。\n位于 ${uri.fsPath}:${range.start.line + 1}:${range.start.character + 1}`,
				vsc.DiagnosticSeverity.Information
			));
		}, });

		diagnosticCollection.set(uri, diagnostics);
	}

	const updateSyntaxCheckForAllTabGroups = (() => {
		let timeOut: ReturnType<typeof setTimeout> | null;

		const checkSyntax = async () => {

			for (const tabGroup of vsc.window.tabGroups.all) {
				for (const tab of tabGroup.tabs) {
					const input = tab.input;
					if (input instanceof vsc.TabInputText) {
						findAndReportSyntaxErrorFromUri(input.uri);
					}
				}
			}
		};

		return () => {
			if (timeOut !== null) {
				clearTimeout(timeOut);
				timeOut = null;
			}
			timeOut = setTimeout(() => {
				checkSyntax();
				timeOut = null;
			}, 300);
		};
	})();

	updateSyntaxCheckForAllTabGroups();
	context.subscriptions.push(
		vsc.workspace.onDidOpenTextDocument(updateSyntaxCheckForAllTabGroups),
		vsc.workspace.onDidChangeTextDocument(updateSyntaxCheckForAllTabGroups),
		vsc.workspace.onDidChangeWorkspaceFolders(updateSyntaxCheckForAllTabGroups),
		// vsc.workspace.onDidDeleteFiles(updateSyntaxCheck),
		vsc.workspace.onDidRenameFiles(updateSyntaxCheckForAllTabGroups),
		diagnosticCollection,
	);

	context.subscriptions.push(
		vsc.commands.registerCommand("cq-ysjyrm-richtext.checkSyntaxForWholeWorkspace", async () => {
			(await vsc.workspace.findFiles("**/*.cqyr.txt")).forEach(findAndReportSyntaxErrorFromUri);
			vsc.window.showInformationMessage("CQYR: 已更新整个工作区。");
		})
	);
}

export function deactivate() {}
