import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
import { captionLogoGeometry, DEFAULT_LOGO_TEXT_STYLE, logoTextCss, logoTextStyle, newLogoText, retainLogoTexts } from '../shared/logoText';
import type { LogoText } from '../shared/types';

test('company text and its style persist per logo; the reusable default persists across events/restart', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'logo-text-test-'));
  let store = new Store(root);
  try {
    store.upsertMedia('logo-a.png', 'logos/logo-a.png', 'image', 'logos');
    store.upsertMedia('logo-b.png', 'logos/logo-b.png', 'image', 'logos');
    const [a, b] = store.media();
    assert.deepEqual(store.logoTextDefault(), DEFAULT_LOGO_TEXT_STYLE);
    const style = { color: '#ffeedd', bold: false, fontSize: 42, strokeColor: '#112233', strokeWidth: 1.5 };
    // A saved default contains style only, never a company name or toggle.
    store.setLogoTextDefault({ ...style, text: 'Do not copy this name', enabled: true });
    assert.deepEqual(store.logoTextDefault(), style);
    const textA: LogoText = { ...newLogoText(store.logoTextDefault()), enabled: true, text: 'Công ty Ánh Dương\n\n& Đối tác' };
    const textB: LogoText = { ...newLogoText(), enabled: true, text: 'Công ty B', bold: true, fontSize: 24 };
    const ad = store.createItem({ name: 'Sponsor with names', itemType: 'ADVERTISEMENT', layout: 'MEDIA_LOGO', logoMediaIds: [a.id, b.id], logoTexts: { [a.id]: textA, [b.id]: textB } });
    const default2 = { ...style, color: '#00aa88', fontSize: 28 };
    store.setLogoTextDefault(default2);
    assert.deepEqual(store.playlist().find(item => item.id === ad.id)?.logoTexts?.[a.id], textA);
    const applied = { ...textA, ...logoTextStyle(store.logoTextDefault()) };
    assert.equal(applied.text, textA.text); assert.equal(applied.enabled, true);
    assert.equal(newLogoText(store.logoTextDefault()).text, '');
    const copy = store.duplicateEvent(store.activeId());
    assert.deepEqual(store.playlist(copy.id).find(item => item.name === ad.name)?.logoTexts, ad.logoTexts);
    store.activate(copy.id);
    assert.deepEqual(store.logoTextDefault(), default2);
    store.db.close(); store = new Store(root);
    assert.deepEqual(store.logoTextDefault(), default2);
    assert.deepEqual(store.playlist().find(item => item.name === ad.name)?.logoTexts, ad.logoTexts);
  } finally { if (store.db.open) store.db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('invalid caption styles, names and unattached logo references are rejected without changing saved data', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'logo-text-validation-test-'));
  const store = new Store(root);
  try {
    store.upsertMedia('a.png', 'logos/a.png', 'image', 'logos');
    store.upsertMedia('b.png', 'logos/b.png', 'image', 'logos');
    const [a, b] = store.media();
    const original = { ...newLogoText(), enabled: true, text: 'Valid company' };
    const ad = store.createItem({ name: 'Sponsor', itemType: 'ADVERTISEMENT', logoMediaIds: [a.id], logoTexts: { [a.id]: original } });
    for (const invalid of [{ color: 'red' }, { strokeColor: 'url(evil)' }, { fontSize: 0 }, { fontSize: 121 }, { strokeWidth: -1 }, { strokeWidth: 7 }, { bold: 'yes' }, { enabled: 1 }, { text: 42 }, { text: 'x'.repeat(201) }]) {
      assert.throws(() => store.updateItem(ad.id, { logoTexts: { [a.id]: { ...original, ...invalid } as LogoText } }));
    }
    assert.throws(() => store.updateItem(ad.id, { logoTexts: { [b.id]: original } }), /assigned logo/);
    assert.throws(() => store.updateItem(ad.id, { logoMediaIds: [], logoTexts: { [a.id]: original } }), /assigned logo/);
    assert.deepEqual(store.playlist().find(item => item.id === ad.id)?.logoTexts, ad.logoTexts);
    assert.throws(() => store.setLogoTextDefault({ ...DEFAULT_LOGO_TEXT_STYLE, fontSize: Infinity }));
    assert.deepEqual(store.logoTextDefault(), DEFAULT_LOGO_TEXT_STYLE);
    store.updateItem(ad.id, { logoTexts: { [a.id]: { ...original, enabled: false } } });
    assert.equal(store.playlist().find(item => item.id === ad.id)?.logoTexts?.[a.id].text, original.text);
    store.updateItem(ad.id, { logoTexts: { [a.id]: { ...original, text: '' } } });
  } finally { store.db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('removing or replacing logos prunes captions and never transfers the prior company name', () => {
  const a = { ...newLogoText(), enabled: true, text: 'Company A' };
  const b = { ...newLogoText(), enabled: true, text: 'Company B' };
  const kept = retainLogoTexts({ a, b }, ['b', 'c']);
  assert.deepEqual(kept, { b });
  assert.deepEqual(retainLogoTexts(kept, []), {});
  assert.deepEqual(newLogoText(), { ...DEFAULT_LOGO_TEXT_STYLE, enabled: false, text: '' });
});

test('caption geometry reserves space below logos at all scales and keeps source proportions', () => {
  for (const [sourceWidth, sourceHeight] of [[100, 100], [400, 100], [100, 400]]) {
    for (const scale of [10, 50, 100, 150, 200]) {
      const geometry = captionLogoGeometry(300, 200, sourceWidth, sourceHeight, 40, 8, scale)!;
      assert.ok(geometry.width <= 300);
      assert.ok(geometry.height + 40 + 8 <= 200);
      assert.ok(Math.abs(geometry.imageWidth / geometry.imageHeight - sourceWidth / sourceHeight) < .000001);
      assert.ok(geometry.imageWidth >= geometry.width && geometry.imageHeight >= geometry.height);
    }
  }
  assert.equal(captionLogoGeometry(300, 40, 100, 100, 40, 8, 100), null);
  assert.equal(captionLogoGeometry(300, 200, 0, 0, 40, 8, 100), null);
  const style = logoTextCss(DEFAULT_LOGO_TEXT_STYLE);
  assert.equal(style.fontWeight, 700);
  assert.equal(parseFloat(style.fontSize) * 10.8, 32);
  assert.equal(style.paintOrder, 'stroke fill');
  assert.equal(logoTextCss({ ...DEFAULT_LOGO_TEXT_STYLE, bold: false, strokeWidth: 0 }).fontWeight, 400);
});
