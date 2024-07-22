import { 
	App, 
	ButtonComponent,
	Editor, 
	MarkdownView, 
	moment,
	Modal, 
	Notice, 
	Plugin, 
	PluginSettingTab, 
	sanitizeHTMLToDom,
	Setting,
	TFile,
	normalizePath,
} from 'obsidian';

interface PasteAsEmbedSettings {
	// TODO: replace Record with Map https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
	userRules: Record<string, PasteRule>;
	datetimeFormat: string; 
}

const DEFAULT_SETTINGS: PasteAsEmbedSettings = {
	userRules: {},
	datetimeFormat: "YYYYMMDD-HHmmss",
}

export default class PasteAsEmbed extends Plugin {
	settings: PasteAsEmbedSettings;
	
	async pasteFilter(
		evt: ClipboardEvent | null, 
		editor: Editor, 
		view: MarkdownView,
	) {
		// The isManuallyTriggered clipboard loading logic is derived from https://github.com/kxxt/obsidian-advanced-paste/blob/cfb04918298f14ffa7f04aefa49beaef9a2e8a76/src/main.ts#L220
		// I'm not sure what isManuallyTriggered is about; Ctrl+V content does appear to be retrievable through both methods used below 
		const isManuallyTriggered = evt == null;  // "Not triggered by Ctrl+V"
	
		let txt; 
		if (isManuallyTriggered) {
			const items = await navigator.clipboard.read();
			if (items.length == 0 || !items[0].types.includes("text/plain"))
				return; 
			const blob = await items[0].getType("text/plain");
			txt = await blob.text();
		} else {
			txt = evt.clipboardData?.getData('text/plain');
		}
		
		if (txt) {
			
			if (!view.file) {
				new Notice("No file open to paste into.");
				return;
			}
			
			const matchingRule = this.getMatchingRule(txt);
			
			if (!matchingRule) {
				return;
			}
			
			evt?.preventDefault();  // Prevent the usual paste from happening, too
			evt?.stopPropagation();  
			
			if (matchingRule.template) {
				txt = matchingRule.template.replace("${content}", txt)
			}
			
			const embedNoteName = this.getEmbedNoteName(matchingRule, view.file);
			const embedFolder = this.getEmbedFolder(matchingRule, view.file)
			
			const cleanEmbedFolder = normalizePath(embedFolder);
			if (!this.app.vault.getFolderByPath(cleanEmbedFolder)) 
				await this.app.vault.createFolder(cleanEmbedFolder);
			
			const embedFilePath = [cleanEmbedFolder, embedNoteName.concat(".md")].join('/');			
			this.app.vault.create(embedFilePath, txt)
			
			editor.replaceSelection(`![[${embedNoteName}]]\n`);
			
			new Notice('Pasted contents of clipboard into embedded note.');
			
		}
	}
	
	getMatchingRule(txt: string) {
		for (const rule of Object.values(this.settings.userRules)) {
			const regexp = new RegExp(rule.pattern);
			if (regexp.test(txt)) {
				return rule;
			}
		}
		return null;
	}
	
	getEmbedNoteName(rule: PasteRule, file: TFile) {
		const datetime = moment().format(this.settings.datetimeFormat);	
		
		const name = rule.filenameFmt
			.replace("${notename}", file.basename)
			.replace("${date}", datetime);
		
		return name;
	}
	
	getEmbedFolder(rule: PasteRule, file: TFile) {
		const ruleFolder = rule.folder.replace('${notename}', file.basename);
		
		let embedFolder;
		if (rule.folder.startsWith('./')) {
			embedFolder = [file.parent?.path, ruleFolder.substring(2)].join('/');
		} else {
			embedFolder = ruleFolder;
		}

		return embedFolder;
	}
	
	async onload() {  // Configure resources needed by the plugin.
		await this.loadSettings();
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new PasteAsEmbedSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on(
				'editor-paste', 
				this.pasteFilter.bind(this)
			)
		);
		
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'paste-as-embed',
			name: 'Paste to new note and embed at current position.',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// editor.replaceSelection('Sample Editor Command' + '\n');
				this.pasteFilter(null, editor, view);
			}
		});

	}

	onunload() {   // Release any resources configured by the plugin.

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	
}


export interface PasteRule {
	name: string;  // Identifies the rule 
	desc?: string;  // Describes the rule
	folder: string;  // Where to create the new file 
	filenameFmt: string;  // How to name the embedded notes. 
	pattern: string;  // Clipboard text pattern that triggers the rule 
	template?: string;  // Insert the pasted text into this template, when writing to new file (e.g. code fence)
}


class PasteAsEmbedSettingTab extends PluginSettingTab {
	plugin: PasteAsEmbed;
	rulesEl: HTMLDivElement;

	constructor(app: App, plugin: PasteAsEmbed) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		
		const datetimeSettingDesc: DocumentFragment = sanitizeHTMLToDom(
			'For formatting embed note names when the ${date} variable is used. <br>'
			+ 'See the <a href="https://momentjs.com/docs/#/displaying/">Moment.js docs</a> for format options.'
		)
		
		new Setting(containerEl)
			.setName("Datetime format")
			.setDesc(datetimeSettingDesc)
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.datetimeFormat ?? "")
				.onChange(async (value) => {
					this.plugin.settings.datetimeFormat = value;
					this.plugin.saveSettings();
				})
			);
				
		new Setting(containerEl)
			.setName("Add new rule")
			.addButton((button: ButtonComponent): ButtonComponent => {
				const b = button
					.setTooltip("Add rule")
					.setIcon('plus')
					.onClick(async () => {
						const modal = new SettingsModal(this.plugin);

						modal.onClose = async () => {
							if (modal.saved) {
								const rule = {
									name: modal.name, 
									folder: modal.folder, 
									pattern: modal.pattern, 
									template: modal.template,
									desc: modal.desc,
									filenameFmt: modal.filenameFmt,
								};
								this.plugin.settings.userRules[rule.name] = rule;
								this.plugin.saveSettings();
								this.display();
							}
						};

						modal.open();
					});
					
				return b;
			});
		
		this.rulesEl = containerEl.createDiv("rules-list");
		this.buildRules(); 
	}
	
	buildRules() { // https://github.com/javalent/admonitions/blob/f19389940b0148b677e106f503980cbb9f767f63/src/settings.ts#L907
		this.rulesEl.empty();
		
		if (this.plugin.settings.userRules) {
			for (const rule of Object.values(this.plugin.settings.userRules)) {
				const setting = new Setting(this.rulesEl) 
					.setName(rule.name)
					.addButton((button: ButtonComponent): ButtonComponent => {
						const b = button
							.setTooltip("Edit rule")
							.setIcon('pencil')
							// .setButtonText("+")
							.onClick(async () => {
								const modal = new SettingsModal(this.plugin, rule);
		
								modal.onClose = async () => {
									if (modal.saved) {
										const modalRule = {
											name: modal.name, 
											folder: modal.folder, 
											pattern: modal.pattern, 
											template: modal.template,
											desc: modal.desc,
											filenameFmt: modal.filenameFmt,
										};
										
										if (modalRule.name != rule.name) {
											// Treat this as a simple renaming
											delete this.plugin.settings.userRules[rule.name];
										}
										
										this.plugin.settings.userRules[modalRule.name] = modalRule;
										this.plugin.saveSettings();
										this.display();
									}
								};
		
								modal.open();
							});
							
						return b;
					});
					
				setting.addButton((button: ButtonComponent): ButtonComponent => {
					const b = button
						.setTooltip("Remove rule")
						.setIcon('cross')
						.onClick(async () => {
							new ConfirmDeleteModal(this.plugin, (result) => {
								if (result) {
									delete this.plugin.settings.userRules[rule.name];
									this.plugin.saveSettings();
									this.display();
								}
							}).open();
							
						});
							
					return b;
				});
					
				if (rule.desc) {
					setting.setDesc(rule.desc)
				}
			}
		}
	}
}


class ConfirmDeleteModal extends Modal {
	result = false;
	onSubmit: (result: boolean) => void; 
	
	constructor(plugin: PasteAsEmbed, onSubmit: (result: boolean) => void) {
		super(plugin.app);
		this.onSubmit = onSubmit;
	}
	
	onOpen() {
		this.titleEl.setText("Confirm rule deletion");
		const { contentEl } = this; 
		contentEl.setText("Are you sure you want to delete this rule?");
		
		const setting = new Setting(contentEl) 
			.addButton((btn) => 
				btn 
					.setButtonText("Delete")
					.onClick(() => {
						this.close();
						this.onSubmit(true);
					})
			);
		
		setting.addButton((btn) => 
			btn 
				.setButtonText("Cancel")
				.onClick(() => {
					this.close(); 
					this.onSubmit(false);	
				})	
		)
	}
}


class SettingsModal extends Modal {
	name: string;  // Identifies the rule 
	pattern: string;  // Clipboard text pattern that triggers the rule 
	template?: string;  // Insert the pasted text into this template, when writing to new file (e.g. code fence)
	desc?: string;
	folder: string;  // Where to create the new file 
	filenameFmt: string = "${date}";
	editing = false;
	saved = false;  // Whether the user clicked "Save" 
	
	constructor(plugin: PasteAsEmbed, rule?: PasteRule) {
		super(plugin.app);
		
		if (rule) {
			this.name = rule.name;
			this.folder = rule.folder;
			this.pattern = rule.pattern;
			this.template = rule.template;
			this.desc = rule.desc;
			this.filenameFmt = rule.filenameFmt;
		}
	}
	
	async display() {
		// this.containerEl.addClass("rule-settings-modal");
		this.titleEl.setText(`${this.editing ? "Edit" : "Add"} rule`);
		
		const { contentEl } = this;
		
		contentEl.empty();
		
		const settingDiv = contentEl.createDiv();
		// const title = this.name ?? "...";
		
		new Setting(settingDiv)
			.setName('Rule name')
			.setDesc('Uniquely identifies the rule')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.name ?? "")
				.onChange(async (value) => {
					this.name = value;
				})
			);
				
		new Setting(settingDiv)
			.setName('Description')
			.setDesc('Optional text to be displayed with the rule, in the Settings pane.')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.desc ?? "")
				.onChange(async (value) => {
					this.desc = value;
				})
			);
				
		new Setting(settingDiv)
			.setName('Pattern')
			.setDesc('Regex pattern that triggers the rule on pasted clipboard text. Leave empty to trigger on all pasted text.')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.pattern ?? "")
				.onChange(async (value) => {
					this.pattern = value;
				})
			);
			
		new Setting(settingDiv)
			.setName('Embedded note folder')
			.setDesc('Where to save the embedded notes. Leave empty to save in the active folder. Start with "./" for a path relative to the active folder. Use ${notename} for the name of the active note. ')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.folder ?? "")
				.onChange(async (value) => {
					this.folder = value;
				})
			);

		new Setting(settingDiv)
			.setName('Embedded note name format')
			.setDesc('Use ${notename} for the name of the active note, and ${date} for a datetime string.')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.filenameFmt ?? "")
				.onChange(async (value) => {
					this.filenameFmt = value;
				})
			);
			
		new Setting(settingDiv)
			.setName('Template')
			.setDesc('Use ${content} to indicate where pasted text should be inserted, before pasting into embedded file. Leave empty to insert as-is.')
			.addTextArea(textArea => {
				textArea.inputEl.rows = 5;
				textArea
					.setPlaceholder('')
					.setValue(this.template ?? "")
					.onChange(async (value) => {
						this.template = value;
					});
			}); File
			
		const footerEl = contentEl.createDiv();
		const footerButtons = new Setting(footerEl);
		footerButtons.addButton((b) => {
			b.setTooltip("Save")
				.setIcon("checkmark")
				.onClick(async () => {
					// TODO: validate the inputs
					this.saved = true;
					this.close();
				});
			return b;
		});
		footerButtons.addExtraButton((b) => {
			b.setIcon("cross")
				.setTooltip("Cancel")
				.onClick(() => {
					this.saved = false;
					this.close();
				});
			return b;
		});
	}
    onOpen() {
        this.display();
    }
}
