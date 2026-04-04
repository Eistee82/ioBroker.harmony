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
    Chip,
    Button,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { I18n } from '@iobroker/adapter-react-v5';
import type { HarmonyDevice } from '../../types/harmony';
import { getDeviceIconSrc } from '../../utils/deviceTypes';
import { HarmonyIcon } from '../Common/HarmonyIcon';

interface DeviceListProps {
    devices: HarmonyDevice[];
    onSelectDevice: (id: string) => void;
    onAddDevice?: () => void;
    onDeleteDevice?: (id: string) => void;
    onIRLearn?: () => void;
}

function transportLabel(transport: number): string {
    switch (transport) {
        case 1: return 'IR';
        case 32: return 'IP';
        case 33: return 'BT';
        default: return String(transport);
    }
}

export function DeviceList({ devices, onSelectDevice, onAddDevice, onDeleteDevice, onIRLearn }: DeviceListProps): React.JSX.Element {
    const [confirmDelete, setConfirmDelete] = React.useState<{ id: string; label: string } | null>(null);

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6">
                    {I18n.t('devices')} ({devices.length})
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                {onIRLearn && (
                    <Button size="small" variant="outlined" color="error" startIcon={<FiberManualRecordIcon />} onClick={onIRLearn}>
                        {I18n.t('irFindDevice')}
                    </Button>
                )}
                {onAddDevice && (
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onAddDevice}>
                        {I18n.t('addDevice')}
                    </Button>
                )}
                </Box>
            </Box>
            {devices.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    {I18n.t('noDevices')}
                </Typography>
            ) : (
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell width={40} />
                                <TableCell>{I18n.t('name')}</TableCell>
                                <TableCell>{I18n.t('manufacturer')}</TableCell>
                                <TableCell>{I18n.t('model')}</TableCell>
                                <TableCell align="right">{I18n.t('commands')}</TableCell>
                                <TableCell>{I18n.t('transport')}</TableCell>
                                {onDeleteDevice && <TableCell width={50} />}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {devices.map((dev) => {
                                const cmdCount = dev.controlGroup.reduce((s, cg) => s + cg.function.length, 0);
                                return (
                                    <TableRow
                                        key={dev.id}
                                        hover
                                        sx={{ cursor: 'pointer' }}
                                        onClick={(): void => onSelectDevice(dev.id)}
                                    >
                                        <TableCell>
                                            <HarmonyIcon src={getDeviceIconSrc(dev.type)} alt={dev.label} size={36} />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={600} noWrap>
                                                {dev.label}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" noWrap>
                                                {dev.manufacturer}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" noWrap>
                                                {dev.model}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">{cmdCount}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={transportLabel(dev.Transport)}
                                                size="small"
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        {onDeleteDevice && (
                                            <TableCell align="right" onClick={(e): void => e.stopPropagation()}>
                                                <Tooltip title={I18n.t('delete')}>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={(): void => setConfirmDelete({ id: dev.id, label: dev.label })}
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
                            if (confirmDelete && onDeleteDevice) {
                                onDeleteDevice(confirmDelete.id);
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
