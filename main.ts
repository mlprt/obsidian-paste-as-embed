import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface PasteAsEmbedSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: PasteAsEmbedSettings = {
	mySetting: 'default'
}

export default class PasteAsEmbed extends Plugin {
	settings: PasteAsEmbedSettings;
	
	async pasteFilter(
		evt: ClipboardEvent, 
		editor: Editor, 
		view: MarkdownView,
	) {
		// Based on https://github.com/kxxt/obsidian-advanced-paste/blob/cfb04918298f14ffa7f04aefa49beaef9a2e8a76/src/main.ts#L220
		// I'm not sure what isManuallyTriggered is about; Ctrl+V does appear to paste through !isManuallyTriggered, so...
		// const isManuallyTriggered = evt == null;  // Not triggered by Ctrl+V 
		const txt= evt.clipboardData?.getData('text/plain');
		
		// The following also retrieves from clipboard, but results in another paste event for some reason
		// const items = await navigator.clipboard.read();
		// const blob = await items[0].getType("text/plain")
		// const txt = await blob.text();
		
		editor.replaceSelection(txt + '\n');
		
		evt?.preventDefault();  // Prevent the usual paste from happening
		evt?.stopPropagation();  
		
		new Notice('Pasted Plotly figure into embed');
	}

	async onload() {  // Configure resources needed by the plugin.
		await this.loadSettings();
		
		console.log('loading plugin');
		
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
				editor.replaceSelection('Sample Editor Command' + '\n');
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
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

class SampleSettingTab extends PluginSettingTab {
	plugin: PasteAsEmbed;

	constructor(app: App, plugin: PasteAsEmbed) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
