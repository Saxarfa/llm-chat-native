import {createContext,useContext} from 'react';
import './SettingsUX.css';

export const SettingsScope=createContext(false);
export const useSettingsScope=()=>useContext(SettingsScope);
