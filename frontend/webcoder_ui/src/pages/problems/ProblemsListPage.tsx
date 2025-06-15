import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProblemService } from '../../services/ApiService';
import { ProblemType } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const ProblemsListPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [problems, setProblems] = useState<ProblemType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProblems = async () => {
      try { 
        setLoading(true); 
        setError(null); 
        const response = await ProblemService.getProblems();
        setProblems(response.data as ProblemType[]); 
      }
      catch (err: any) { 
        setError(err.message || t('error_loading_problems', 'Failed to load problems.')); 
      }
      finally { 
        setLoading(false); 
      }
    };
    fetchProblems();
  }, [t]);

  if (loading) return <LoadingSpinner />;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h2>{t('problem_list_header', 'Problems List')}</h2>
      {problems.length === 0 ? (
        <p>{t('no_problems_available', 'No problems available at the moment.')}</p>
      ) : (
        <ul>
          {problems.map((problem) => (
            <li key={problem.id}>
              <Link to={`/problems/${problem.id}`}>
                {problem.title_i18n[i18n.language] || problem.title_i18n.en || `Problem ID: ${problem.id}`}
              </Link>
              {' - '} 
              {t(`difficulty_${problem.difficulty?.toLowerCase()}`, problem.difficulty)} 
              {' ('} 
              {t(`status_${problem.status?.toLowerCase()}`, problem.status)} 
              {')'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProblemsListPage;
