import { UiFinder, Waiter } from '@ephox/agar';
import { afterEach, describe, it } from '@ephox/bedrock-client';
import { Obj } from '@ephox/katamari';
import { TinyAssertions, TinyHooks, TinyUiActions } from '@ephox/mcagar';
import { SugarBody } from '@ephox/sugar';

import Editor from 'tinymce/core/api/Editor';
import Plugin from 'tinymce/plugins/template/Plugin';
import Theme from 'tinymce/themes/silver/Theme';

const insertTemplate = async (editor: Editor) => {
  const toolbarButtonSelector = '[role="toolbar"] button[aria-label="Insert template"]';
  const dialogSelector = 'div.tox-dialog';

  TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
  await TinyUiActions.pWaitForDialog(editor);
  TinyUiActions.submitDialog(editor);
  await Waiter.pTryUntil('Dialog should close', () => UiFinder.notExists(SugarBody.body(), dialogSelector));
};

describe('browser.tinymce.plugins.template.DatesTest', () => {
  const hook = TinyHooks.bddSetup<Editor>({
    plugins: 'template',
    toolbar: 'template',
    base_url: '/project/tinymce/js/tinymce'
  }, [ Plugin, Theme ]);

  let settings = new Set<string>();
  const addSettings = (config: Record<string, any>) => {
    const editor = hook.editor();
    Obj.each(config, (val, key) => {
      editor.settings[key] = val;
      settings.add(key);
    });
  };
  const delSettings = () => {
    const editor = hook.editor();
    settings.forEach((key) => delete editor.settings[key]);
    settings = new Set<string>();
  };

  afterEach(() => {
    const editor = hook.editor();
    delSettings();
    editor.setContent('');
  });

  it('TBA: Template: Test cdate in snippet with default class', async () => {
    const editor = hook.editor();
    addSettings({
      templates: [{ title: 'a', description: 'b', content: '<p class="cdate">x</p>' }],
      template_cdate_format: 'fake date',
    });
    await insertTemplate(editor);
    TinyAssertions.assertContent(editor, '<p class="cdate">fake date</p>');
  });

  it('TBA: Template: Test cdate in snippet with custom class', async () => {
    const editor = hook.editor();
    addSettings({
      template_cdate_classes: 'customCdateClass',
      templates: [{ title: 'a', description: 'b', content: '<p class="customCdateClass">x</p>' }],
      template_cdate_format: 'fake date'
    });
    await insertTemplate(editor);
    TinyAssertions.assertContent(editor,
      '<p class="customCdateClass">fake date</p>'
    );
  });

  it('TBA: Template: Test mdate updates with each serialization', async () => {
    const editor = hook.editor();
    addSettings({
      template_mdate_format: 'fake modified date',
      template_cdate_format: 'fake created date',
      templates: [{ title: 'a', description: 'b', content: '<div class="mceTmpl"><p class="mdate"></p><p class="cdate"></p></div>' }]
    });
    await insertTemplate(editor);
    TinyAssertions.assertContent(editor, [
      '<div class="mceTmpl">',
      '<p class="mdate">fake modified date</p>',
      '<p class="cdate">fake created date</p>',
      '</div>'
    ].join('\n'));
    addSettings({ template_mdate_format: 'changed modified date' });
    TinyAssertions.assertContent(editor, [
      '<div class="mceTmpl">',
      '<p class="mdate">changed modified date</p>',
      '<p class="cdate">fake created date</p>',
      '</div>'
    ].join('\n'));
  });

  it('TBA: Template: Test mdate updates with each serialization with custom class', async () => {
    const editor = hook.editor();
    addSettings({
      template_mdate_classes: 'modified',
      template_mdate_format: 'fake modified date',
      template_cdate_format: 'fake created date',
      templates: [{ title: 'a', description: 'b', content: '<div class="mceTmpl"><p class="modified"></p><p class="cdate"></p></div>' }]
    });
    await insertTemplate(editor);
    TinyAssertions.assertContent(editor, [
      '<div class="mceTmpl">',
      '<p class="modified">fake modified date</p>',
      '<p class="cdate">fake created date</p>',
      '</div>'
    ].join('\n'));
    addSettings({ template_mdate_format: 'changed modified date' });
    TinyAssertions.assertContent(editor, [
      '<div class="mceTmpl">',
      '<p class="modified">changed modified date</p>',
      '<p class="cdate">fake created date</p>',
      '</div>'
    ].join('\n'));
  });
});
