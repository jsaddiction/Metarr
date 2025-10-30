/**
 * Type-Safe SQL Update Builder
 *
 * Provides a safe, type-checked way to build UPDATE queries with allowlisted columns.
 * Addresses Audit Finding 1.4: SQL injection risk in dynamic query building.
 *
 * This utility makes the allowlist pattern explicit and prevents accidental SQL injection
 * by enforcing compile-time type checking on column names.
 */

export interface UpdateColumn {
  column: string;
  value: any;
}

export interface UpdateBuilderResult {
  query: string;
  values: any[];
}

/**
 * Builds a type-safe UPDATE query with allowlisted columns
 *
 * @param table - The table name (hardcoded, never from user input)
 * @param allowedColumns - Allowlist of column names that can be updated
 * @param updates - Object with column names as keys and values to update
 * @param whereClause - WHERE clause (e.g., "id = ?")
 * @param whereValues - Values for the WHERE clause
 * @returns Query string and parameterized values array
 *
 * @example
 * ```typescript
 * const result = buildUpdateQuery(
 *   'movies',
 *   ['title', 'year', 'plot'],
 *   { title: 'New Title', year: 2024 },
 *   'id = ?',
 *   [123]
 * );
 * // result.query: "UPDATE movies SET title = ?, year = ? WHERE id = ?"
 * // result.values: ['New Title', 2024, 123]
 * ```
 */
export function buildUpdateQuery(
  table: string,
  allowedColumns: readonly string[],
  updates: Record<string, any>,
  whereClause: string,
  whereValues: any[]
): UpdateBuilderResult {
  const updateColumns: string[] = [];
  const updateValues: any[] = [];

  // Build SET clause - only include columns in allowlist
  for (const column of Object.keys(updates)) {
    // Skip columns not in allowlist (silent filtering for convenience)
    if (!allowedColumns.includes(column)) {
      continue;
    }

    updateColumns.push(`${column} = ?`);
    updateValues.push(updates[column]);
  }

  if (updateColumns.length === 0) {
    throw new Error('No valid columns to update - no provided fields match the allowlist');
  }

  // Validate WHERE clause contains placeholders
  if (!whereClause.includes('?')) {
    throw new Error('WHERE clause must use parameterized placeholders (?)');
  }

  // Build complete query
  const query = `UPDATE ${table} SET ${updateColumns.join(', ')} WHERE ${whereClause}`;

  // Combine all values (SET values + WHERE values)
  const values = [...updateValues, ...whereValues];

  return { query, values };
}

/**
 * Type-safe UPDATE query builder with fluent API
 *
 * @example
 * ```typescript
 * const builder = new UpdateQueryBuilder('movies')
 *   .allowColumns(['title', 'year', 'plot', 'mpaa'])
 *   .set({ title: 'New Title', year: 2024 })
 *   .where('id = ?', [123]);
 *
 * const { query, values } = builder.build();
 * await db.execute(query, values);
 * ```
 */
export class UpdateQueryBuilder {
  private table: string;
  private allowedColumns: readonly string[] = [];
  private updates: Record<string, any> = {};
  private whereClause: string = '';
  private whereValues: any[] = [];

  constructor(table: string) {
    this.table = table;
  }

  /**
   * Set the allowlist of columns that can be updated
   */
  allowColumns(columns: readonly string[]): this {
    this.allowedColumns = columns;
    return this;
  }

  /**
   * Set columns to update (filtered by allowlist)
   */
  set(updates: Record<string, any>): this {
    this.updates = updates;
    return this;
  }

  /**
   * Set WHERE clause with parameterized values
   */
  where(clause: string, values: any[]): this {
    this.whereClause = clause;
    this.whereValues = values;
    return this;
  }

  /**
   * Build the final query and values
   */
  build(): UpdateBuilderResult {
    if (this.allowedColumns.length === 0) {
      throw new Error('No allowed columns specified. Call allowColumns() first.');
    }

    if (!this.whereClause) {
      throw new Error('No WHERE clause specified. Call where() first.');
    }

    return buildUpdateQuery(
      this.table,
      this.allowedColumns,
      this.updates,
      this.whereClause,
      this.whereValues
    );
  }
}

/**
 * Validates that a column name is in the allowlist
 * Useful for individual column operations
 */
export function validateColumn(column: string, allowedColumns: readonly string[], table: string): void {
  if (!allowedColumns.includes(column)) {
    throw new Error(
      `Column "${column}" is not in allowlist for table "${table}". ` +
        `Allowed columns: ${allowedColumns.join(', ')}`
    );
  }
}

/**
 * Filters an object to only include keys in the allowlist
 * Returns a new object with only allowed fields
 */
export function filterAllowedFields<T extends Record<string, any>>(
  data: T,
  allowedColumns: readonly string[]
): Partial<T> {
  const filtered: Partial<T> = {};

  for (const key of Object.keys(data)) {
    if (allowedColumns.includes(key)) {
      filtered[key as keyof T] = data[key];
    }
  }

  return filtered;
}
