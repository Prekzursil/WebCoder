import React, { useEffect, useState } from 'react';
import { AdminService } from '../../services/ApiService';
import LoadingSpinner from '../../components/common/LoadingSpinner';

interface SiteStats {
    user_count: number;
    problem_count: number;
    submission_count: number;
}

const SiteStatsPage: React.FC = () => {
    const [stats, setStats] = useState<SiteStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await AdminService.getStats();
                setStats(response.data as SiteStats);
            } catch (err) {
                setError('Failed to fetch site statistics.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return <LoadingSpinner />;
    }

    if (error) {
        return <div className="text-red-500">{error}</div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">Total Users</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.user_count}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">Total Problems</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.problem_count}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">Total Submissions</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.submission_count}</p>
            </div>
        </div>
    );
};

export default SiteStatsPage;
