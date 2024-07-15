# Obsidian Paste-As-Embed

When pasting text into a note, check the text against regexp patterns. When it matches, create a new note containing the text, and embed that note into the active note.

## How to use

Define rules in the plugin settings pane, that determine when and how to create and embed a note, depending on the text being pasted. 

## How it works

When text is pasted from the clipboard, it is checked against a list of user-defined rules:

- Each rule is associated with a regular expression string. 
- The plugin engages the first rule whose regexp tests `true` against the pasted text. 

When a rule is engaged:

- the pasted text is inserted into a template, if one is supplied for the rule;
- a new note is created, with its name and folder determined according to the settings defined for the rule;
- the contents of the new note are the (potentially templated) pasted text;
- the new note is embedded at the current position in the active note.

If no rule is engaged, pasting proceeds as it normally would.

Note the following limitations of this early version of the plugin:

- The first matching rule in the list is the only one executed.
- An empty regexp string always matches; so a rule with an empty regexp string will always be executed, if no preceding rules matched the pasted text. 
- No rules that follow a rule with an empty regexp string will ever be executed.
- If a rule is renamed, it is moved to the end of the list and becomes last in precedence.

## Motivation

I like using the [obsidian-plotly](https://github.com/Dmytro-Shulha/obsidian-plotly) plugin to render interactive figures in my notes. The user pastes Plotly JSON inside a code block, which is displayed as the rendered figure.
However, when editing the note or interacting with the plot, the code block sometimes collapses back into its unrendered form. This sometimes causes the editor to lag to the point of unusability. 

Thankfully:
- If the code block is placed in a standalone note which is then embedded, it renders well as an embed and does not collapse back into editable JSON.
- We usually do not need to edit the JSON directly, and if we do, it is probably easier to do so when they are in a separate note and not expanding/collapsing thousands of characters inside an existing view.
- This allows us to treat Plotly figures like other (e.g. image) attachments.

However, it is effortful to manually create and embed these notes. Acknowledging that similar use cases may benefit from automation, and wanting to try writing an Obsidian plugin for the first time, I wrote this one.

Here are the settings I use for embedding Plotly figures made in Python, using the output from `fig.to_json()`:

![](images/plotly-example.png)

## Acknowledgments 

Parts of this plugin are directly derived (see source comments) from parts of the following plugins:

- [obsidian-admonition](https://github.com/javalent/admonitions) 
- [advanced-paste](https://github.com/kxxt/obsidian-advanced-paste) 

Additionally, I took inspiration from [obsidian-custom-attachment-location](https://github.com/RainCat1998/obsidian-custom-attachment-location) concerning the customization of note and folder naming.

## TODO

- [ ] Allow individual rules to be toggled on and off
- [ ] Control precedence/order of rules
- [ ] Allow rules to be either 1) regexp-based, or 2) associated with keyboard shortcuts
- [ ] Toggle CSS styling (e.g. clean-embeds)

### Mobile support

- [ ] Replace Node.js `path` 