
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
	const [collapsed, setCollapsed] = useState(false);
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
		<aside className={collapsed ? styles.sidebarCollapsed : styles.sidebar}>
			<button
				className={styles.sidebarCollapseBtn}
				aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				onClick={() => setCollapsed((v) => !v)}
				type="button"
			>
				{collapsed ? <span>&#x25B6;</span> : <span>&#x25C0;</span>}
			</button>
			<ul className={styles.sidebarMenuGroup}>
				<li><Link to={dashboardPath} className={styles.sidebarLink}>{collapsed ? '🏠' : 'Dashboard'}</Link></li>
				<li><Link to="/admin/albums" className={styles.sidebarLink}>{collapsed ? '📚' : 'Albums'}</Link></li>
				<li><Link to="/admin/orders" className={styles.sidebarLink}>{collapsed ? '🛒' : 'Orders'}</Link></li>
				<li><Link to="/admin/watermarks" className={styles.sidebarLink}>{collapsed ? '💧' : 'Watermarks'}</Link></li>
				<li><Link to="/admin/shipping" className={styles.sidebarLink}>{collapsed ? '🚚' : 'Shipping'}</Link></li>
				{inStudioAdminMenu && (
					<>
						<li><Link to="/admin/packages" className={styles.sidebarLink}>{collapsed ? '📦' : 'Packages'}</Link></li>
						<li><Link to="/admin/discount-codes" className={styles.sidebarLink}>{collapsed ? '🏷️' : 'Discounts'}</Link></li>
					</>
				)}
				<li>
					<Link to={inStudioAdminMenu ? '/admin/vendor-integrations' : '/admin/configuration'} className={styles.sidebarLink}>
						{collapsed ? '🔌' : inStudioAdminMenu ? 'Vendor Integrations' : 'Lab Configuration'}
					</Link>
				</li>
				{isStudioAdmin && (
					<li><Link to="/admin/studio-tickets" className={styles.sidebarLink}>{collapsed ? '🎫' : 'My Tickets'}</Link></li>
				)}
				{isSuperAdmin && (
					<li><Link to="/admin/tickets" className={styles.sidebarLink}>{collapsed ? '📋' : 'All Tickets'}</Link></li>
				)}
				{isStudioAdmin && (
					<li><Link to="/admin/profile" className={styles.sidebarLink}>{collapsed ? '💳' : 'Subscription'}</Link></li>
				)}
				{isSuperAdmin && (
					<li><Link to="/admin/price-lists" className={styles.sidebarLink}>{collapsed ? '💲' : 'Studio Price Lists'}</Link></li>
				)}
				{isStudioAdmin && (
					<li><Link to="#" className={styles.sidebarLink} style={{ pointerEvents: 'none', opacity: 0.5 }}>{collapsed ? '💰' : 'Super Admin Pricing'}</Link></li>
				)}
				<li><Link to="/admin/profile" className={styles.sidebarLink}>{collapsed ? '👤' : 'Profile'}</Link></li>
			</ul>
			{isSuperAdmin && (
				<div className={styles.sidebarSuperAdminGroup}>
					<button className={styles.sidebarExpandBtn} onClick={() => setSuperAdminOpen(v => !v)} style={{ fontWeight: 700, fontSize: '1.1rem' }}>
						{collapsed ? '🛡️' : <>Super Admin {superAdminOpen ? '▼' : '▶'}</>}
					</button>
					{superAdminOpen && !collapsed && (
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

