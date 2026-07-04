// Pure data-source-row → title-field mapping. Ported verbatim from the client
// (client/src/control-shell/lib/entry-utils.js) so the server can apply a data
// row to an output identically to the control panel — enabling server-side row
// stepping for MIDI, Companion and plugins. Keep the two in sync.

export const buildEffectiveLocalFieldMap = (entry, templateFields = []) => {
  const existing = Array.isArray(entry?.localFieldMap) ? entry.localFieldMap : [];
  const mapByName = new Map(existing.filter((item) => item?.name).map((item) => [item.name, item]));

  return templateFields.map((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);

    return {
      name: field.name,
      label: field.label || field.name,
      sourceColumnIndex: Number.isFinite(sourceColumnIndex) ? sourceColumnIndex : index,
    };
  });
};

export const buildEffectiveVmixFieldMap = (entry, templateFields = []) => {
  const existing = Array.isArray(entry?.vmixFieldMap) ? entry.vmixFieldMap : [];
  const mapByName = new Map(existing.filter((item) => item?.name).map((item) => [item.name, item]));

  return templateFields.map((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);

    return {
      name: field.name,
      label: field.label || field.name,
      vmixFieldName: mapped?.vmixFieldName || field.label || field.name,
      sourceColumnIndex: Number.isFinite(sourceColumnIndex) ? sourceColumnIndex : index,
    };
  });
};

export const buildEffectiveEntryFieldMap = (entry, templateFields = []) =>
  entry?.entryType === 'vmix'
    ? buildEffectiveVmixFieldMap(entry, templateFields)
    : buildEffectiveLocalFieldMap(entry, templateFields);

export const applyRowToFields = (templateFields, rowValues, currentFields, fieldMap = null) => {
  const nextFields = { ...currentFields };
  const mapByName = new Map(
    Array.isArray(fieldMap)
      ? fieldMap.filter((item) => item?.name).map((item) => [item.name, item])
      : [],
  );

  templateFields.forEach((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);
    const resolvedIndex =
      Number.isFinite(sourceColumnIndex) && sourceColumnIndex >= 0 ? sourceColumnIndex : null;
    nextFields[field.name] = resolvedIndex === null ? '' : rowValues[resolvedIndex] ?? '';
  });

  return nextFields;
};
