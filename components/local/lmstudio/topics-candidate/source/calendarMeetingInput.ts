// SPDX-License-Identifier: AGPL-3.0-or-later
// Local models may fill unused optional strings with null. This adaptation is
// limited to meeting tools; the native MCP contract remains unchanged.
type Schema = Record<string, any>;
const meetingTools = new Set(['calendar_prepare_meeting', 'calendar_submit_meeting']);
const escapedEtag = /^\\"([^"\x00-\x20\x7f]+)\\"$/;

function etagSchema(original: Schema, nullable: boolean): Schema {
  return {
    anyOf: [
      {...original},
      {type: 'string', pattern: escapedEtag.source},
      ...(nullable ? [{type: 'null'}] : []),
    ],
    description: 'Bei update/cancel zwingend: starker ETag aus calendar_read_event einschließlich beider Doppelanführungszeichen. Genau eine zusätzliche äußere JSON-Maskierung wird vor dem nativen Aufruf entfernt; keine schwachen/unquotierten oder erfundenen Versionswerte.',
  };
}

function actionContract(original: Schema, adapted: Schema): Schema {
  const p = original.properties;
  if (!p?.action || !p.eventId || !p.eventPath || !p.etag || !p.expectedUid ||
      !p.details?.properties || !p.attendees) return adapted;
  const properties = {...adapted.properties};
  properties.action = {...properties.action, description: 'create: eventId/details/attendees erforderlich. update/cancel: eventPath/etag/expectedUid gemeinsam erforderlich; eventId weglassen.'};
  properties.eventId = {...properties.eventId, description: 'Nur create: feste, ausdrücklich gewählte Zielkennung zwingend angeben. Bei update/cancel weglassen oder null, niemals neu erfinden.'};
  properties.eventPath = {...properties.eventPath, description: 'Bei update/cancel zwingend vollständiger eventPath aus calendar_read_event. Bei create weglassen oder null.'};
  properties.expectedUid = {...properties.expectedUid, description: 'Bei update/cancel zwingend die unveränderte UID aus calendar_read_event. Feldname expectedUid. Bei create weglassen oder null.'};
  properties.etag = etagSchema(p.etag, true);
  const existing = {
    eventPath: {...p.eventPath},
    etag: etagSchema(p.etag, false),
    expectedUid: {...p.expectedUid},
    eventId: {type: 'null'},
  };
  const detail = properties.details;
  const originalDetail = p.details.properties;
  const createDetail = {
    ...detail,
    required: [...new Set([...(detail.required ?? []), 'title'])],
    properties: {...detail.properties, title: {...originalDetail.title}},
    anyOf: [
      {required: ['start', 'end'], properties: {start: {...originalDetail.start}, end: {...originalDetail.end}}},
      {required: ['startDate', 'endDate'], properties: {startDate: {...originalDetail.startDate}, endDate: {...originalDetail.endDate}}},
    ],
  };
  const when = (action: string, then: Schema) => ({
    if: {properties: {action: {const: action}}, required: ['action']},
    then,
  });
  return {
    ...adapted,
    properties,
    allOf: [
      ...(adapted.allOf ?? []),
      when('create', {
        required: ['eventId', 'details', 'attendees'],
        properties: {
          eventId: {...p.eventId}, details: createDetail, attendees: {...p.attendees},
          eventPath: {type: 'null'}, etag: {type: 'null'}, expectedUid: {type: 'null'},
        },
      }),
      when('update', {
        required: ['eventPath', 'etag', 'expectedUid'],
        properties: existing,
        anyOf: [
          {required: ['details'], properties: {details: {type: 'object', minProperties: 1}}},
          {required: ['attendees']},
        ],
      }),
      when('cancel', {
        required: ['eventPath', 'etag', 'expectedUid'],
        properties: existing,
        not: {anyOf: [{required: ['details']}, {required: ['attendees']}]},
      }),
    ],
  };
}

function modelSchema(schema: Schema): Schema {
  if (schema.type !== 'object' || !schema.properties) return schema;
  const required = new Set<string>(schema.required ?? []);
  const properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => {
    const original = value as Schema;
    const adapted = modelSchema(original);
    return [key, !required.has(key) && original.type === 'string'
      ? {...adapted, type: ['string', 'null']}
      : adapted];
  }));
  return {...schema, properties};
}

function nativeArguments(schema: Schema, value: any): any {
  if (schema.type !== 'object' || !schema.properties || value === null ||
      typeof value !== 'object' || Array.isArray(value)) return value;
  const required = new Set<string>(schema.required ?? []);
  const entries = Object.entries(value).flatMap(([key, item]) => {
    const property = schema.properties[key] as Schema | undefined;
    if (property && property.type === 'string' && !required.has(key) && item === null) return [];
    return [[key, property ? nativeArguments(property, item) : item]];
  });
  return Object.fromEntries(entries);
}

export function calendarMeetingModelSchema(name: string, schema: Schema): Schema {
  return meetingTools.has(name) ? actionContract(schema, modelSchema(schema)) : schema;
}

export function calendarMeetingNativeArguments(name: string, schema: Schema, args: any): any {
  if (!meetingTools.has(name)) return args;
  const value = nativeArguments(schema, args);
  const match = typeof value?.etag === 'string' ? value.etag.match(escapedEtag) : null;
  return match ? {...value, etag: '"' + match[1] + '"'} : value;
}
