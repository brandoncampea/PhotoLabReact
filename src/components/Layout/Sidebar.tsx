
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Sidebar.module.css';



const superAdminLinks = [
	{ to: '/super-admin', label: 'Super Admin Dashboard' },
	{ to: '/admin/stripe', label: 'Payment Methods' },
	{ to: '/admin/subscription-gateway', label: 'Studio Subscription Payment Gateway' },
	{ to: '/admin/subscription', label: 'Subscription Pricing' },
	{ to: '/admin/configuration', label: 'Lab Configuration' },
	{ to: '/admin/price-lists', label: 'Price Lists' },
	{ to: '/admin/users', label: 'Users' },
	{ to: '/admin/studio-admins', label: 'Studio Admins' },
	{ to: '/admin/analytics', label: 'Analytics' },
	{ to: '/admin/profile', label: 'Profile' },
];



const Sidebar: React.FC = () => {
	const [superAdminOpen, setSuperAdminOpen] = useState(false);

	return (
		<aside className={styles.sidebar}>
			<ul className={styles.sidebarMenuGroup}>
				<li><Link to="/admin/dashboard" className={styles.sidebarLink}>Dashboard</Link></li>
				<li><Link to="/admin/albums" className={styles.sidebarLink}>Albums</Link></li>
				<li><Link to="/admin/orders" className={styles.sidebarLink}>Orders</Link></li>
				<li><Link to="/admin/analytics" className={styles.sidebarLink}>Analytics</Link></li>
				<li><Link to="/admin/products" className={styles.sidebarLink}>Products</Link></li>
				<li><Link to="/admin/customers" className={styles.sidebarLink}>Customers</Link></li>
				<li><Link to="/admin/shipping" className={styles.sidebarLink}>Shipping</Link></li>
				<li><Link to="/admin/album-styles" className={styles.sidebarLink}>Album Styles</Link></li>
				<li><Link to="/admin/discount-codes" className={styles.sidebarLink}>Discount Codes</Link></li>
				<li><Link to="/admin/watermarks" className={styles.sidebarLink}>Watermarks</Link></li>
				<li><Link to="/admin/profile" className={styles.sidebarLink}>Profile</Link></li>
             
				
			</ul>
			<div className={styles.sidebarSuperAdminGroup}>
				<button className={styles.sidebarExpandBtn} onClick={() => setSuperAdminOpen(v => !v)} style={{ fontWeight: 700, fontSize: '1.1rem' }}>
					Super Admin {superAdminOpen ? '▼' : '▶'}
				</button>
				{superAdminOpen && (
					<ul className={styles.sidebarSubmenu}>
						{superAdminLinks.map(link => (
							<li key={link.to}>
								<Link to={link.to} className={styles.sidebarLink}>
									{link.label}
								</Link>
							</li>
						))}
					</ul>
				)}
			</div>
		</aside>
	);
};

export default Sidebar;

