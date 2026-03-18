import React from 'react';

interface DataTableProps {
  columns: string[];
  data: Array<Record<string, any>>;
}

const DataTable: React.FC<DataTableProps> = ({ columns, data }) => (
  <table className="data-table">
    <thead>
      <tr>
        {columns.map((col) => (
          <th key={col}>{col}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {data.map((row, idx) => (
        <tr key={idx}>
          {columns.map((col) => (
            <td key={col}>{row[col]}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

export default DataTable;
