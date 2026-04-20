

// import React, { useState } from 'react';

const AdminOrders = () => (
  <>
    <h2>Orders</h2>
    <div className="admin-orders-content">
      <input type="text" placeholder="Search orders" className="admin-search" />
      <button className="admin-filter">Filter</button>
      {/* Render orders table/list here */}
    </div>
  </>
);

export default AdminOrders;
