import React from 'react';
import {
    Box,
    Typography,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    IconButton,
    Chip,
    Tooltip,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { I18n } from '@iobroker/adapter-react-v5';
import type { HarmonyActivity } from '../../types/harmony';
import { getActivityIconSrc, getActivityTypeLabel } from '../../utils/activityTypes';
import { HarmonyIcon } from '../Common/HarmonyIcon';

interface ActivityListProps {
    activities: HarmonyActivity[];
    onSelectActivity: (id: string) => void;
    onReorder?: (activities: HarmonyActivity[]) => void;
    onAddActivity?: () => void;
    onDeleteActivity?: (id: string) => void;
}

export function ActivityList({ activities, onSelectActivity, onReorder, onAddActivity, onDeleteActivity }: ActivityListProps): React.JSX.Element {
    const [confirmDelete, setConfirmDelete] = React.useState<{ id: string; label: string } | null>(null);
    const sorted = [...activities]
        .filter((a) => a.id !== '-1')
        .sort((a, b) => (a.activityOrder || 0) - (b.activityOrder || 0));

    const handleMove = (index: number, direction: 'up' | 'down'): void => {
        if (!onReorder) return;
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= sorted.length) return;

        // Build a new array with swapped activityOrder values
        const updated = sorted.map((a) => ({ ...a }));
        const tmpOrder = updated[index].activityOrder;
        updated[index].activityOrder = updated[swapIndex].activityOrder;
        updated[swapIndex].activityOrder = tmpOrder;

        // Merge back with the filtered-out PowerOff entry
        const powerOff = activities.filter((a) => a.id === '-1');
        onReorder([...powerOff, ...updated]);
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6">
                    {I18n.t('activities')} ({sorted.length})
                </Typography>
                {onAddActivity && (
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onAddActivity}>
                        {I18n.t('addActivity')}
                    </Button>
                )}
            </Box>
            {sorted.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    {I18n.t('noActivities')}
                </Typography>
            ) : (
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell width={80}>{I18n.t('order')}</TableCell>
                                <TableCell width={40} />
                                <TableCell>{I18n.t('name')}</TableCell>
                                <TableCell>{I18n.t('type')}</TableCell>
                                <TableCell align="right">{I18n.t('devices')}</TableCell>
                                <TableCell align="right">#</TableCell>
                                {onDeleteActivity && <TableCell width={50} />}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sorted.map((act, idx) => {
                                const deviceCount = Object.keys(act.fixit || {}).length;
                                return (
                                    <TableRow
                                        key={act.id}
                                        hover
                                        sx={{ cursor: 'pointer' }}
                                        onClick={(): void => onSelectActivity(act.id)}
                                    >
                                        <TableCell
                                            onClick={(e): void => e.stopPropagation()}
                                            sx={{ whiteSpace: 'nowrap' }}
                                        >
                                            {idx > 0 && (
                                                <Tooltip title={I18n.t('moveUp')}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={(): void => handleMove(idx, 'up')}
                                                    >
                                                        <ArrowUpwardIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            {idx < sorted.length - 1 && (
                                                <Tooltip title={I18n.t('moveDown')}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={(): void => handleMove(idx, 'down')}
                                                    >
                                                        <ArrowDownwardIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <HarmonyIcon src={getActivityIconSrc(act.type)} alt={act.label} size={36} />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={600} noWrap>
                                                {act.label}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={getActivityTypeLabel(act.type)}
                                                size="small"
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell align="right">{deviceCount}</TableCell>
                                        <TableCell align="right">{act.activityOrder}</TableCell>
                                        {onDeleteActivity && (
                                            <TableCell align="right" onClick={(e): void => e.stopPropagation()}>
                                                <Tooltip title={I18n.t('delete')}>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={(): void => setConfirmDelete({ id: act.id, label: act.label })}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Delete confirmation */}
            <Dialog open={!!confirmDelete} onClose={(): void => setConfirmDelete(null)}>
                <DialogTitle>{I18n.t('delete')}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {confirmDelete?.label}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={(): void => setConfirmDelete(null)}>{I18n.t('cancel')}</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={(): void => {
                            if (confirmDelete && onDeleteActivity) {
                                onDeleteActivity(confirmDelete.id);
                                setConfirmDelete(null);
                            }
                        }}
                    >
                        {I18n.t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
