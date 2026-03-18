import React from 'react';

const Sidebar: React.FC = () => (
  <aside className="sidebar">
    <ul className="sidebar-menu">
      <li>Dashboard</li>
      <li>Albums</li>
      <li>Orders</li>
      <li>Admin</li>
      <li>Super Admin</li>
      {/* Add more menu items as needed */}
    </ul>
  </aside>
);

export default Sidebar;
