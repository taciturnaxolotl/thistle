import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

export interface TableColumn {
	key: string;
	label: string;
	sortable?: boolean;
	render?: (value: unknown, row: unknown) => unknown;
}

@customElement("admin-data-table")
export class AdminDataTable extends LitElement {
	@property({ type: Array }) columns: TableColumn[] = [];
	@property({ type: Array }) data: unknown[] = [];
	@property({ type: String }) searchPlaceholder = "Search...";
	@property({ type: String }) emptyMessage = "No data available";
	@property({ type: Boolean}) loading = false;

	@property({ type: String }) private searchTerm = "";
	@property({ type: String }) private sortKey = "";
	@property({ type: String }) private sortDirection: "asc" | "desc" = "asc";

	static override styles = css`
    :host {
      display: block;
    }

    .controls {
      margin-bottom: 1rem;
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .search {
      flex: 1;
      max-width: 20rem;
      padding: 0.5rem 0.75rem;
      border: 2px solid var(--secondary);
      border-radius: 4px;
      font-size: 1rem;
      font-family: inherit;
      background: var(--background);
      color: var(--text);
    }

    .search:focus {
      outline: none;
      border-color: var(--primary);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 8px;
      overflow: hidden;
    }

    thead {
      background: var(--primary);
      color: white;
    }

    th {
      padding: 1rem;
      text-align: left;
      font-weight: 600;
      user-select: none;
    }

    th.sortable {
      cursor: pointer;
      position: relative;
    }

    th.sortable:hover {
      background: var(--gunmetal);
    }

    .sort-indicator {
      margin-left: 0.5rem;
      opacity: 0.6;
    }

    td {
      padding: 1rem;
      border-top: 1px solid var(--secondary);
      color: var(--text);
    }

    tbody tr {
      cursor: pointer;
    }

    tbody tr:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .empty-state, .loading {
      text-align: center;
      padding: 3rem;
      color: var(--text);
      opacity: 0.6;
    }
  `;

	private get filteredData() {
		let result = [...this.data];

		if (this.searchTerm) {
			const term = this.searchTerm.toLowerCase();
			result = result.filter((row) => {
				return this.columns.some((col) => {
					const value = (row as Record<string, unknown>)[col.key];
					return String(value).toLowerCase().includes(term);
				});
			});
		}

		if (this.sortKey) {
			result.sort((a, b) => {
				const aVal = (a as Record<string, unknown>)[this.sortKey];
				const bVal = (b as Record<string, unknown>)[this.sortKey];

				let comparison = 0;
				if (typeof aVal === "string" && typeof bVal === "string") {
					comparison = aVal.localeCompare(bVal);
				} else if (typeof aVal === "number" && typeof bVal === "number") {
					comparison = aVal - bVal;
				} else {
					const aStr = String(aVal);
					const bStr = String(bVal);
					comparison = aStr.localeCompare(bStr);
				}

				return this.sortDirection === "asc" ? comparison : -comparison;
			});
		}

		return result;
	}

	private handleSearch(e: Event) {
		this.searchTerm = (e.target as HTMLInputElement).value;
	}

	private handleSort(column: TableColumn) {
		if (!column.sortable) return;

		if (this.sortKey === column.key) {
			this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
		} else {
			this.sortKey = column.key;
			this.sortDirection = "asc";
		}
	}

	private renderCell(column: TableColumn, row: unknown) {
		const value = (row as Record<string, unknown>)[column.key];
		if (column.render) {
			return column.render(value, row);
		}
		return value;
	}

	private handleRowClick(row: unknown) {
		this.dispatchEvent(
			new CustomEvent("row-click", {
				detail: row,
				bubbles: true,
				composed: true,
			}),
		);
	}

	override render() {
		if (this.loading) {
			return html`<div class="loading">Loading...</div>`;
		}

		const filtered = this.filteredData;

		return html`
      <div class="controls">
        <input
          type="text"
          class="search"
          placeholder=${this.searchPlaceholder}
          @input=${this.handleSearch}
          value=${this.searchTerm}
        />
      </div>

      ${
				filtered.length === 0
					? html`<div class="empty-state">${this.emptyMessage}</div>`
					: html`
          <table>
            <thead>
              <tr>
                ${this.columns.map(
									(col) => html`
                  <th
                    class=${col.sortable ? "sortable" : ""}
                    @click=${() => this.handleSort(col)}
                  >
                    ${col.label}
                    ${
											col.sortable && this.sortKey === col.key
												? html`<span class="sort-indicator">
                          ${this.sortDirection === "asc" ? "▲" : "▼"}
                        </span>`
												: ""
										}
                  </th>
                `,
								)}
              </tr>
            </thead>
            <tbody>
              ${filtered.map(
								(row) => html`
                <tr @click=${() => this.handleRowClick(row)}>
                  ${this.columns.map(
										(col) => html`<td>${this.renderCell(col, row)}</td>`,
									)}
                </tr>
              `,
							)}
            </tbody>
          </table>
        `
			}
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"admin-data-table": AdminDataTable;
	}
}
