import React from 'react';

interface DataTableProps {
  columns: string[];
  data: Array<Record<string, any>>;
}

const DataTable: React.FC<DataTableProps> = ({ columns, data }) => (
  <table className="data-table dark-table">
    <thead className="dark-table-header">
      <tr>
        {columns.map((col) => (
          <th key={col} className="dark-table-th">{col}</th>
        ))}
      </tr>
    </thead>
    <tbody className="dark-table-body">
      {data.map((row, idx) => (
        <tr key={idx} className="dark-table-row">
          {columns.map((col) => (
            <td key={col} className="dark-table-td">{row[col]}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

export default DataTable;
