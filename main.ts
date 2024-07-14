import { 
	App, 
	ButtonComponent,
	Component,
	Editor, 
	MarkdownView, 
	Modal, 
	Notice, 
	Plugin, 
	PluginSettingTab, 
	Setting,
	setIcon,
} from 'obsidian';

interface PasteAsEmbedSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: PasteAsEmbedSettings = {
	mySetting: 'default'
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
			evt?.preventDefault();  // Prevent the usual paste from happening, too
			evt?.stopPropagation();  
			
			this.app.vault.create("test.md", txt)
			
			editor.replaceSelection('![[test]]\n');
		}
		
		// TODO: Redirect any kind of paste (e.g. images) to an embedded file
		// Not sure if that's possible without opening an editor/view (?) to the new note
	    // and creating a new event wrt the new editor, 
		// but maybe we can leave it unfocused and close it after. 
		
		new Notice('Pasted contents of clipboard into embedded note');
	}

	async onload() {  // Configure resources needed by the plugin.
		await this.loadSettings();
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
		
		// console.log('loading plugin');
		
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
	directory: string;  // Where to create the new file 
	pattern: string;  // Clipboard text pattern that triggers the rule 
	template?: string;  // Insert the pasted text into this template, when writing to new file (e.g. code fence)
}


class SampleSettingTab extends PluginSettingTab {
	plugin: PasteAsEmbed;
	userRules: Record<string, PasteRule>;;
	rulesEl: HTMLDivElement;

	constructor(app: App, plugin: PasteAsEmbed) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
				
		new Setting(containerEl)
			.setName("Add New")
			.setDesc(
				"Add new rule."
			)
			.addButton((button: ButtonComponent): ButtonComponent => {
				let b = button
					.setTooltip("Add rule")
					.setButtonText("+")
					.onClick(async () => {
						let modal = new SettingsModal(this.plugin);

						modal.onClose = async () => {
							if (modal.saved) {
								const rule = {
									name: modal.name, 
									directory: modal.directory, 
									pattern: modal.pattern, 
									template: modal.template,
									desc: modal.desc,
								};
								this.userRules[rule.name] = rule;
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
		
		for (const rule of Object.values(this.userRules)) {
			let setting = new Setting(this.rulesEl) 
				.setName(rule.name)
				.addButton((button: ButtonComponent): ButtonComponent => {
					let b = button
						.setTooltip("Edit rule")
						.setIcon('pencil')
						// .setButtonText("+")
						.onClick(async () => {
							let modal = new SettingsModal(this.plugin, rule);
	
							modal.onClose = async () => {
								if (modal.saved) {
									const modalRule = {
										name: modal.name, 
										directory: modal.directory, 
										pattern: modal.pattern, 
										template: modal.template,
										desc: modal.desc,
									};
									
									if (modalRule.name != rule.name) {
										// Treat this as a simple renaming
										delete this.userRules[rule.name];
									}
									
									this.userRules[modalRule.name] = modalRule;
									this.plugin.saveSettings();
									this.display();
								}
							};
	
							modal.open();
						});
						
					return b;
				});
				
			if (rule.desc) {
				setting.setDesc(rule.desc)
			}
		}
	}
}

class SettingsModal extends Modal {
	name: string;  // Identifies the rule 
	directory: string;  // Where to create the new file 
	pattern: string;  // Clipboard text pattern that triggers the rule 
	template?: string;  // Insert the pasted text into this template, when writing to new file (e.g. code fence)
	desc?: string;
	editing: boolean = false;
	saved: boolean = false;  // Whether the user clicked "Save" 
	
	constructor(plugin: PasteAsEmbed, rule?: PasteRule) {
		super(plugin.app);
		
		if (rule) {
			this.name = rule.name;
			this.directory = rule.directory;
			this.pattern = rule.pattern;
			this.template = rule.template;
			this.desc = rule.desc;
		}
	}
	
	async display() {
		// this.containerEl.addClass("rule-settings-modal");
		this.titleEl.setText(`${this.editing ? "Edit" : "Add"} rule`);
		
		let { contentEl } = this;
		
		contentEl.empty();
		
		const settingDiv = contentEl.createDiv();
		const title = this.name ?? "...";
		
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
			.setName('Description (optional)')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.desc ?? "")
				.onChange(async (value) => {
					this.desc = value;
				})
			);
				
		new Setting(settingDiv)
			.setName('Pattern')
			.setDesc('Regex pattern that triggers the rule on pasted clipboard text')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.pattern ?? "")
				.onChange(async (value) => {
					this.pattern = value;
				})
			);
			
		new Setting(settingDiv)
			.setName('Directory')
			// TODO: relative or absolute 
			.setDesc('Where to save the embedded notes')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.directory ?? "")
				.onChange(async (value) => {
					this.directory = value;
				})
			);
			
		new Setting(settingDiv)
			.setName('Template (optional)')
			.setDesc('Pasted text is inserted into this, in the embedded note')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.template ?? "")
				.onChange(async (value) => {
					this.template = value;
				})
			);
			
		let footerEl = contentEl.createDiv();
		let footerButtons = new Setting(footerEl);
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
