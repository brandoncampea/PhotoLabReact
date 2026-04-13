
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Sidebar.module.css';
import { useAuth } from '../../contexts/AuthContext';



const superAdminLinks = [
	{ to: '/super-admin', label: 'Dashboard' },
	{ to: '/admin/super-pricing', label: 'Super Admin Pricing' },
	{ to: '/admin/users', label: 'Users' },
	{ to: '/admin/studio-admins', label: 'Studio Admins' },
	{ to: '/admin/tickets', label: 'All Tickets' },
	{ to: '/admin/profile', label: 'Profile' },
	{ to: '/admin/stripe', label: 'Payment Methods' },
	{ to: '/admin/subscription-gateway', label: 'Studio Subscription Payment Gateway' },
	{ to: '/admin/subscription', label: 'Subscription Pricing' },
	{ to: '/admin/configuration', label: 'Lab Configuration' },
];



const Sidebar: React.FC = () => {
	const { user } = useAuth();
	const [superAdminOpen, setSuperAdminOpen] = useState(false);
	const isSuperAdmin = user?.role === 'super_admin';
	const isStudioAdmin = user?.role === 'studio_admin';
	const viewAsStudioId = Number(localStorage.getItem('viewAsStudioId'));
	const isActingAsStudio = isSuperAdmin && Number.isInteger(viewAsStudioId) && viewAsStudioId > 0;
	const inStudioAdminMenu = isStudioAdmin || isActingAsStudio;
	const dashboardPath = isSuperAdmin && !isActingAsStudio ? '/super-admin' : '/admin/dashboard';

	if (!isSuperAdmin && !isStudioAdmin) {
		return null;
	}

	return (
		<aside className={styles.sidebar}>
			<ul className={styles.sidebarMenuGroup}>
				<li><Link to={dashboardPath} className={styles.sidebarLink}>Dashboard</Link></li>
				<li><Link to="/admin/albums" className={styles.sidebarLink}>Albums</Link></li>
				<li><Link to="/admin/orders" className={styles.sidebarLink}>Orders</Link></li>
				<li><Link to="/admin/watermarks" className={styles.sidebarLink}>Watermarks</Link></li>
							 <li><Link to="/admin/shipping" className={styles.sidebarLink}>Shipping</Link></li>
							 {inStudioAdminMenu && (
								<li><Link to="/admin/discount-codes" className={styles.sidebarLink}>Discounts</Link></li>
							 )}
				<li>
					<Link to={inStudioAdminMenu ? '/admin/vendor-integrations' : '/admin/configuration'} className={styles.sidebarLink}>
						{inStudioAdminMenu ? 'Vendor Integrations' : 'Lab Configuration'}
					</Link>
				</li>
				{/* Ticketing menu items */}
				{isStudioAdmin && (
					<li><Link to="/admin/studio-tickets" className={styles.sidebarLink}>My Tickets</Link></li>
				)}
				{isSuperAdmin && (
					<li><Link to="/admin/tickets" className={styles.sidebarLink}>All Tickets</Link></li>
				)}
				{isStudioAdmin && (
					<li><Link to="/admin/profile" className={styles.sidebarLink}>Subscription</Link></li>
				)}
				{isSuperAdmin && (
					<li><Link to="/admin/price-lists" className={styles.sidebarLink}>Studio Price Lists</Link></li>
				)}
				{isStudioAdmin && (
					<li><Link to="#" className={styles.sidebarLink} style={{ pointerEvents: 'none', opacity: 0.5 }}>Super Admin Pricing</Link></li>
				)}
				<li><Link to="/admin/profile" className={styles.sidebarLink}>Profile</Link></li>
			</ul>
			{isSuperAdmin && (
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
			)}
		</aside>
	);
};

export default Sidebar;

