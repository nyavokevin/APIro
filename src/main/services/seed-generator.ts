import { faker } from '@faker-js/faker';

const HISTORY_LIMIT = 20;

const seedHistory: Record<string, string[]> = {};

function pushHistory(fieldName: string, value: string): void {
  const key = fieldName.toLowerCase();
  if (!seedHistory[key]) seedHistory[key] = [];
  seedHistory[key].unshift(value);
  if (seedHistory[key].length > HISTORY_LIMIT) {
    seedHistory[key] = seedHistory[key].slice(0, HISTORY_LIMIT);
  }
}

function matches(name: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(name));
}

/** Splits camelCase / snake_case / kebab-case / dotted names into space-delimited tokens. */
function normalizeTokens(fieldName: string): string {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./]+/g, ' ')
    .toLowerCase();
}

/**
 * Generates a context-aware fake value based on the field name.
 * Patterns cover common API field names (email, password, name, id, date, etc.).
 */
export function generateFieldValue(fieldName: string): string {
  const name = fieldName.toLowerCase();
  const norm = normalizeTokens(fieldName);
  const m = (patterns: RegExp[]): boolean => matches(name, patterns) || matches(norm, patterns);

  let value: string;

  if (m([/\bemail\b/, /e-mail/])) {
    value = faker.internet.email();
  } else if (m([/password/, /passwd/, /pwd/])) {
    value = faker.internet.password();
  } else if (m([/\bfirstname\b/, /^first$/, /givenname/])) {
    value = faker.person.firstName();
  } else if (m([/\blastname\b/, /^last$/, /surname/, /familyname/])) {
    value = faker.person.lastName();
  } else if (m([/\bname\b/, /fullname/, /username/, /user_name/])) {
    value = faker.person.fullName();
  } else if (m([/\buuid\b/, /\bguid\b/, /\bid\b/, /^id$/, /identifier/])) {
    value = faker.string.uuid();
  } else if (m([/date/, /timestamp/, /createdat/, /updatedat/])) {
    value = faker.date.recent().toISOString();
  } else if (m([/avatar/, /image/, /picture/, /photo/, /img/])) {
    value = faker.image.avatar();
  } else if (m([/address/, /street/])) {
    value = faker.location.streetAddress();
  } else if (m([/\bcity\b/, /town/])) {
    value = faker.location.city();
  } else if (m([/country/, /nation/])) {
    value = faker.location.country();
  } else if (m([/zip/, /postal/, /postcode/])) {
    value = faker.location.zipCode();
  } else if (m([/phone/, /mobile/, /tel/, /fax/])) {
    value = faker.phone.number();
  } else if (m([/url/, /website/, /link/, /href/])) {
    value = faker.internet.url();
  } else if (m([/description/, /bio/, /about/, /comment/, /notes?/, /message/])) {
    value = faker.lorem.sentence();
  } else if (m([/title/, /subject/, /heading/])) {
    value = faker.lorem.sentence(3);
  } else if (m([/price/, /amount/, /cost/, /total/, /fee/])) {
    value = faker.commerce.price();
  } else if (m([/quantity/, /\bqty\b/, /count/, /\bnumber\b/, /age/, /year/])) {
    value = String(faker.number.int({ min: 1, max: 100 }));
  } else if (m([/\b(is|has|enabled?|active|flag|verified|published)\b/])) {
    value = String(faker.datatype.boolean());
  } else {
    value = faker.lorem.word();
  }

  pushHistory(fieldName, value);
  return value;
}

function generateForValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return generateFieldValue(key);
  }
  if (typeof value === 'string') {
    // if the string looks like a value rather than a template, generate a replacement
    return generateFieldValue(key);
  }
  if (typeof value === 'number') {
    return faker.number.int({ min: 1, max: 1000 });
  }
  if (typeof value === 'boolean') {
    return faker.datatype.boolean();
  }
  if (Array.isArray(value)) {
    return value.map((item) => generateForValue(key, item));
  }
  if (typeof value === 'object') {
    return generateObject(value as Record<string, unknown>);
  }
  return value;
}

function generateObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = generateForValue(key, value);
  }
  return out;
}

/**
 * Parses a JSON body and generates seed values for every key it contains.
 * Returns a pretty-printed JSON string (or the original string on parse error).
 */
export function generateBulkSeed(body: string): string {
  if (!body || !body.trim()) return body;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      const generated = generateObject(parsed as Record<string, unknown>);
      return JSON.stringify(generated, null, 2);
    }
    return body;
  } catch {
    return body;
  }
}

/** Returns the last 20 generated values per field name. */
export function getSeedHistory(): Record<string, string[]> {
  return seedHistory;
}
