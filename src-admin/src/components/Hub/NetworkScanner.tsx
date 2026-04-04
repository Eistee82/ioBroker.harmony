import React, { useState, useCallback } from 'react';
import {
    Box, Typography, Button, Card, CardContent,
    CircularProgress, Alert, Chip, IconButton, Tooltip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import DevicesIcon from '@mui/icons-material/Devices';
import { I18n } from '@iobroker/adapter-react-v5';

interface ScannedDevice {
    friendlyName: string;
    manufacturer: string;
    modelName: string;
    modelNumber: string;
    ipAddress: string;
    uuid: string;
    class: string;
    serialNumber: string;
}

interface NetworkScannerProps {
    hubName: string;
    sendCommand: <T>(command: string, payload?: unknown) => Promise<{ success: boolean; data?: T; error?: string }>;
}

export function NetworkScanner({ hubName, sendCommand }: NetworkScannerProps): React.JSX.Element {
    const [scanning, setScanning] = useState(false);
    const [devices, setDevices] = useState<ScannedDevice[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleStartScan = useCallback(async () => {
        setScanning(true);
        setError(null);
        setDevices([]);

        const startResp = await sendCommand('startNetworkScan', { hubName });
        if (!startResp.success) {
            setError(startResp.error || 'Failed to start scan');
            setScanning(false);
            return;
        }

        // Poll every 3 seconds for results
        let pollCount = 0;
        const interval = setInterval(async () => {
            pollCount++;
            const pollResp = await sendCommand<{ scanArray?: ScannedDevice[] }>('pollNetworkScan', { hubName });
            if (pollResp.success && pollResp.data) {
                const scanArray = (pollResp.data as any)?.scanArray || [];
                if (scanArray.length > 0) {
                    setDevices(scanArray.map((d: any) => ({
                        friendlyName: d.friendlyName || '',
                        manufacturer: d.manufacturer || '',
                        modelName: d.modelName || '',
                        modelNumber: d.modelNumber || '',
                        ipAddress: (d.ipAddress || '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
                        uuid: d.uuid || '',
                        class: d.class || '',
                        serialNumber: d.serialNumber || '',
                    })));
                }
            }
            if (pollCount >= 5) {
                clearInterval(interval);
                await sendCommand('stopNetworkScan', { hubName });
                setScanning(false);
            }
        }, 3000);
    }, [hubName, sendCommand]);

    const handleStopScan = useCallback(async () => {
        await sendCommand('stopNetworkScan', { hubName });
        setScanning(false);
    }, [hubName, sendCommand]);

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">{I18n.t('networkScanner')}</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {!scanning ? (
                        <Button
                            variant="contained"
                            startIcon={<SearchIcon />}
                            onClick={(): void => { void handleStartScan(); }}
                        >
                            {I18n.t('scanNetwork')}
                        </Button>
                    ) : (
                        <Button
                            variant="outlined"
                            color="warning"
                            startIcon={<StopIcon />}
                            onClick={(): void => { void handleStopScan(); }}
                        >
                            {I18n.t('stopScan')}
                        </Button>
                    )}
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {scanning && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                        {I18n.t('scanning')}... ({devices.length} {I18n.t('devices').toLowerCase()})
                    </Typography>
                </Box>
            )}

            {devices.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{I18n.t('name')}</TableCell>
                                <TableCell>{I18n.t('manufacturer')}</TableCell>
                                <TableCell>{I18n.t('model')}</TableCell>
                                <TableCell>{I18n.t('ipAddress')}</TableCell>
                                <TableCell>{I18n.t('type')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {devices.map((dev, i) => (
                                <TableRow key={dev.uuid || i}>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={600}>
                                            {dev.friendlyName || '-'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{dev.manufacturer || '-'}</TableCell>
                                    <TableCell>{dev.modelName || '-'}</TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                            {dev.ipAddress || '-'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={dev.class || 'Unknown'} size="small" variant="outlined" />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : !scanning && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    {I18n.t('scanNetworkDesc')}
                </Typography>
            )}
        </Box>
    );
}
