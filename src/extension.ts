import * as vsc from 'vscode';

export interface CqyrSyntaxErr {
	message: string,
	uri: vsc.Uri,
	range: vsc.Range,
}

const annotationReg = /\{[^\$\}]*?\$[^\$\}]*?\}/g;
const boldReg = /\*\*.*?\*\*/g;
const IllegalReg = /[\{\$\}]|\*\*/g;

export function activate(context: vsc.ExtensionContext) {
	const diagnosticCollection = vsc.languages.createDiagnosticCollection();

	async function findAndReportSyntaxErrorFromUri(uri: vsc.Uri) {
		if (uri.fsPath.endsWith("_bilingual.cqyr.txt") || !uri.fsPath.endsWith(".cqyr.txt")) { return; }
		const errs: vsc.Diagnostic[] = [];
		const doc = await vsc.workspace.openTextDocument(uri);
		const txt = doc.getText().replace(annotationReg, sub => " ".repeat(sub.length)).replace(boldReg, sub => " ".repeat(sub.length));
		for (const match of txt.matchAll(IllegalReg)) {
			const startPos = doc.positionAt(match.index);
			const endPos = doc.positionAt(match.index + match[0].length);
			const range = new vsc.Range(startPos, endPos);
			errs.push(new vsc.Diagnostic(
				range,
				`CQYR: 非法字符 "${match[0]}"。\n位于 ${uri.fsPath}:${startPos.line + 1}:${startPos.character + 1}`,
				vsc.DiagnosticSeverity.Error
			));
		}
		diagnosticCollection.set(uri, errs);
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
			}, 500);
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
