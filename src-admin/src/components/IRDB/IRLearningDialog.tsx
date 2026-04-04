import React, { useState, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, CircularProgress, Alert,
    IconButton, Chip, Divider, Stepper, Step, StepLabel,
    List, ListItem, ListItemText, ListItemIcon,
    Card, CardContent, CardActionArea,
    ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import CloseIcon from '@mui/icons-material/Close';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import StopIcon from '@mui/icons-material/Stop';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BoltIcon from '@mui/icons-material/Bolt';
import DevicesIcon from '@mui/icons-material/Devices';
import RouterIcon from '@mui/icons-material/Router';
import SettingsRemoteIcon from '@mui/icons-material/SettingsRemote';
import { I18n } from '@iobroker/adapter-react-v5';

interface DecodedIR {
    protocol: string;
    device: number;
    subdevice: number;
    function: number;
    hex: string;
}

interface IRDBMatch {
    manufacturer: string;
    deviceType: string;
    functionName: string;
}

interface DeviceCandidate {
    manufacturer: string;
    deviceType: string;
    matchedFunctions: string[];
    confidence: number;
}

interface IRLearningDialogProps {
    open: boolean;
    hubName: string;
    sendCommand: <T>(command: string, payload?: unknown) => Promise<{ success: boolean; data?: T; error?: string }>;
    onClose: () => void;
    onDeviceIdentified?: (device: { manufacturer: string; deviceType: string; functions: string[] }) => void;
}

const STEP_LABELS = ['Capture', 'Identify', 'Result'];
const BUTTON_SUGGESTIONS = ['Power', 'Menu', 'Exit', 'Volume Up', 'Channel Up', 'OK/Enter'];

export function IRLearningDialog({ open, hubName, sendCommand, onClose, onDeviceIdentified }: IRLearningDialogProps): React.JSX.Element {
    const [step, setStep] = useState(0);
    const [irSource, setIrSource] = useState<'remote' | 'hub'>('remote');
    const [capturing, setCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [captures, setCaptures] = useState<string[]>([]);
    const [lastDecoded, setLastDecoded] = useState<DecodedIR | null>(null);
    const [candidates, setCandidates] = useState<DeviceCandidate[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<DeviceCandidate | null>(null);
    const [captureIndex, setCaptureIndex] = useState(0);

    const resetState = useCallback(() => {
        setStep(0);
        setCapturing(false);
        setError(null);
        setCaptures([]);
        setLastDecoded(null);
        setCandidates([]);
        setSelectedDevice(null);
        setCaptureIndex(0);
    }, []);

    const handleStartCapture = useCallback(async () => {
        setError(null);
        setCapturing(true);
        const resp = await sendCommand('startIRCapture', { hubName });
        if (!resp.success) {
            setError(resp.error || 'Failed to start IR capture');
            setCapturing(false);
        }
    }, [hubName, sendCommand]);

    const handleStopCapture = useCallback(async () => {
        setCapturing(false);
        await sendCommand('stopIRCapture', { hubName });

        // The IR data comes back through the WebSocket as a message
        // For now, we simulate by calling decodeIRCapture
        // In a real implementation, we'd listen for the ir.cap response
        // TODO: Listen for actual IR capture data from hub WebSocket

        // Advance to identify step
        setCaptureIndex((c) => c + 1);
        if (captures.length === 0) {
            setStep(1);
        }
    }, [hubName, sendCommand, captures]);

    const handleSelectDevice = useCallback((candidate: DeviceCandidate) => {
        setSelectedDevice(candidate);
        setStep(2);
    }, []);

    const handleConfirm = useCallback(() => {
        if (selectedDevice && onDeviceIdentified) {
            onDeviceIdentified({
                manufacturer: selectedDevice.manufacturer,
                deviceType: selectedDevice.deviceType,
                functions: selectedDevice.matchedFunctions,
            });
        }
        resetState();
        onClose();
    }, [selectedDevice, onDeviceIdentified, resetState, onClose]);

    const handleClose = useCallback(() => {
        if (capturing) {
            void sendCommand('stopIRCapture', { hubName });
        }
        resetState();
        onClose();
    }, [capturing, hubName, sendCommand, resetState, onClose]);

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6">{I18n.t('irLearning')}</Typography>
                <IconButton size="small" onClick={handleClose}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
                    {STEP_LABELS.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* Step 0: Capture */}
                {step === 0 && (
                    <Box sx={{ textAlign: 'center' }}>
                        {/* IR Source selection */}
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                {I18n.t('irSourceLabel')}
                            </Typography>
                            <ToggleButtonGroup
                                value={irSource}
                                exclusive
                                onChange={(_, val): void => { if (val) setIrSource(val); }}
                                size="small"
                            >
                                <ToggleButton value="remote">
                                    <SettingsRemoteIcon sx={{ mr: 0.5 }} fontSize="small" />
                                    {I18n.t('irSourceRemote')}
                                </ToggleButton>
                                <ToggleButton value="hub">
                                    <RouterIcon sx={{ mr: 0.5 }} fontSize="small" />
                                    {I18n.t('irSourceHub')}
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                        <Divider sx={{ mb: 2 }} />

                        <Typography variant="body1" gutterBottom>
                            {irSource === 'remote' ? I18n.t('irPointAtRemote') : I18n.t('irPointAtHub')}
                        </Typography>
                        <Typography variant="h6" color="primary" sx={{ my: 2 }}>
                            {BUTTON_SUGGESTIONS[captureIndex] || 'Any button'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            {I18n.t('irLearningDesc')}
                        </Typography>

                        {!capturing ? (
                            <Button
                                variant="contained"
                                color="error"
                                size="large"
                                startIcon={<FiberManualRecordIcon />}
                                onClick={(): void => { void handleStartCapture(); }}
                                sx={{ px: 4, py: 1.5 }}
                            >
                                {I18n.t('startCapture')}
                            </Button>
                        ) : (
                            <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, p: 3, bgcolor: 'error.50', borderRadius: 2, mb: 2 }}>
                                    <CircularProgress size={24} color="error" />
                                    <Box>
                                        <Typography variant="body1" fontWeight={600} color="error.main">
                                            {I18n.t('irCapturing')}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {I18n.t('irCapturingDesc')}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Button
                                    variant="outlined"
                                    color="warning"
                                    startIcon={<StopIcon />}
                                    onClick={(): void => { void handleStopCapture(); }}
                                >
                                    {I18n.t('stopCapture')}
                                </Button>
                            </Box>
                        )}

                        {lastDecoded && (
                            <Box sx={{ mt: 3, p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
                                <Typography variant="body2" fontWeight={600}>
                                    {I18n.t('decoded')}: {lastDecoded.protocol}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Device: {lastDecoded.device}, Command: {lastDecoded.function}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}

                {/* Step 1: Identify / Narrow Down */}
                {step === 1 && (
                    <Box>
                        {candidates.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 3 }}>
                                <CircularProgress size={24} sx={{ mb: 2 }} />
                                <Typography>{I18n.t('searching')}...</Typography>
                            </Box>
                        ) : candidates.length === 1 ? (
                            // Auto-select if only one candidate
                            <Box sx={{ textAlign: 'center', py: 2 }}>
                                <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                                <Typography variant="h6" gutterBottom>{I18n.t('deviceIdentified')}</Typography>
                                <Typography variant="body1">{candidates[0].manufacturer} - {candidates[0].deviceType}</Typography>
                                <Button
                                    variant="contained"
                                    sx={{ mt: 2 }}
                                    onClick={(): void => handleSelectDevice(candidates[0])}
                                >
                                    {I18n.t('next')}
                                </Button>
                            </Box>
                        ) : (
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    {I18n.t('multipleCandidates', String(candidates.length))}
                                </Typography>
                                <Grid2 container spacing={1}>
                                    {candidates.slice(0, 12).map((c, i) => (
                                        <Grid2 key={i} size={{ xs: 12, sm: 6 }}>
                                            <Card variant="outlined">
                                                <CardActionArea onClick={(): void => handleSelectDevice(c)}>
                                                    <CardContent sx={{ py: 1.5 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <DevicesIcon color="primary" />
                                                            <Box>
                                                                <Typography variant="subtitle2" fontWeight={600}>
                                                                    {c.manufacturer}
                                                                </Typography>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {c.deviceType}
                                                                </Typography>
                                                            </Box>
                                                            <Chip label={`${c.confidence}%`} size="small" color={c.confidence > 75 ? 'success' : 'default'} sx={{ ml: 'auto' }} />
                                                        </Box>
                                                    </CardContent>
                                                </CardActionArea>
                                            </Card>
                                        </Grid2>
                                    ))}
                                </Grid2>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    {I18n.t('pressAnotherButton')}
                                </Typography>
                                <Button
                                    variant="outlined"
                                    color="error"
                                    startIcon={<FiberManualRecordIcon />}
                                    onClick={(): void => { setStep(0); }}
                                >
                                    {I18n.t('captureAnother')}
                                </Button>
                            </Box>
                        )}
                    </Box>
                )}

                {/* Step 2: Result */}
                {step === 2 && selectedDevice && (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                        <Typography variant="h6" gutterBottom>
                            {selectedDevice.manufacturer} {selectedDevice.deviceType}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {I18n.t('matchedFunctions')}: {selectedDevice.matchedFunctions.join(', ')}
                        </Typography>
                        <Chip label={`${selectedDevice.confidence}% ${I18n.t('confidence')}`} color="success" />
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>{I18n.t('cancel')}</Button>
                {step === 2 && selectedDevice && (
                    <Button variant="contained" onClick={handleConfirm}>
                        {I18n.t('addDevice')}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
