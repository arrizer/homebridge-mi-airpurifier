require('./Base');

const inherits = require('util').inherits;
const miio = require('miio');

var Accessory, PlatformAccessory, Service, Characteristic, UUIDGen;

MiAirPurifier2S = function(platform, config) {
    this.init(platform, config);
    this.name = config['airPurifierName'];
    
    Accessory = platform.Accessory;
    PlatformAccessory = platform.PlatformAccessory;
    Service = platform.Service;
    Characteristic = platform.Characteristic;
    UUIDGen = platform.UUIDGen;

    var that = this;

    this.logDebug = function(message) {
        platform.log.debug("[" + this.name + "] " + message);
    };

    this.logError = function(message) {
        platform.log.error("[" + this.name + "] " + message);
    };

    this.device = {
        getProps: async function(props) {
            return Promise.reject(new Error("Cannot getProps(" + props.join(", ") + "): Not connected to device"));
        },
        setCache: function(method) {},
        call: function() {
            return Promise.reject(new Error("Cannot perform call " + method + ": Not connected to device"));
        }
    };
    
    this.logDebug("Connecting to device " + this.config['ip']);
    miio.device({
        address: this.config['ip'],
        token: this.config['token']
    }).then(device => {
        that.logDebug("Connected to air purifier at " + this.config['ip']);
        that.device.cache = {};
        that.device.call = function(method, args) {
            return device.call(method, args);
        }
        that.device.getProps = function(props, mustFetch) {
            var values = {};

            var makeResult = function() {
                var result = [];
                for (i = 0; i < props.length; i++) {
                    const prop = props[i];
                    result.push(values[prop]);
                }
                return result;
            }
            
            if (!mustFetch) {
                for (i = 0; i < props.length; i++) {
                    const prop = props[i];
                    var value = that.device.cache[prop];
                    values[prop] = value;
                }
            }
            
            const propsToFetch = props.filter((prop) => !(values[prop] != null));

            if (propsToFetch.length == 0) {
                const result = makeResult();
                that.logDebug("Using cached values for " + props.join(", ") + ": " + JSON.stringify(values));
                return Promise.resolve(result);
            }

            that.logDebug("Fetching device values for " + propsToFetch.join(", "));
            return new Promise((resolve, reject) => {
                device.call('get_prop', propsToFetch).then(result => {
                    for (i = 0; i < propsToFetch.length; i++) {
                        const prop = propsToFetch[i];
                        values[prop] = result[i];
                        that.device.cache[prop] = values[prop];
                    }
                    resolve(makeResult());
                }).catch(error => {
                    reject(error);
                });
            });
        }
        that.device.setCache = function(prop, value) {
            that.device.cache[prop] = value;
        }
    }).catch(error => {
        that.logError("Failed to connect: " + error);
    });

    this.accessories = {};
    if(!this.config['airPurifierDisable'] && this.config['airPurifierName'] && this.config['airPurifierName'] != "" && this.config['silentModeSwitchName'] && this.config['silentModeSwitchName'] != "") {
        this.accessories['airPurifierAccessory'] = new MiAirPurifier2SAirPurifierAccessory(this);
    }
    if(!this.config['temperatureDisable'] && this.config['temperatureName'] && this.config['temperatureName'] != "") {
        this.accessories['temperatureAccessory'] = new MiAirPurifier2STemperatureAccessory(this);
    }
    if(!this.config['humidityDisable'] && this.config['humidityName'] && this.config['humidityName'] != "") {
        this.accessories['humidityAccessory'] = new MiAirPurifier2SHumidityAccessory(this);
    }
    if(!this.config['buzzerSwitchDisable'] && this.config['buzzerSwitchName'] && this.config['buzzerSwitchName'] != "") {
        this.accessories['buzzerSwitchAccessory'] = new MiAirPurifier2SBuzzerSwitchAccessory(this);
    }
    if(!this.config['ledBulbDisable'] && this.config['ledBulbName'] && this.config['ledBulbName'] != "") {
        this.accessories['ledBulbAccessory'] = new MiAirPurifier2SLEDBulbAccessory(this);
    }
    if(!this.config['airQualityDisable'] && this.config['airQualityName'] && this.config['airQualityName'] != "") {
        this.accessories['airQualityAccessory'] = new MiAirPurifier2SAirQualityAccessory(this);
    }
    var accessoriesArr = this.obj2array(this.accessories);
    
    this.logDebug("Initializing " + this.config["type"] + " device: " + this.config["ip"] + ", accessories size: " + accessoriesArr.length);
    
    return accessoriesArr;
}
inherits(MiAirPurifier2S, Base);

MiAirPurifier2SAirPurifierAccessory = function(dThis) {
    this.device = dThis.device;
    this.name = dThis.config['airPurifierName'];
    this.silentModeSwitchDisable = dThis.config['silentModeSwitchDisable'];
    this.silentModeSwitchName = dThis.config['silentModeSwitchName'];
    this.platform = dThis.platform;
    this.logDebug = dThis.logDebug;
    this.logError = dThis.logError;
    this.frm = [0,5,10,15,20,25,30,40,50,60,70,80,90,95,100];
}

MiAirPurifier2SAirPurifierAccessory.prototype.getServices = function() {
    var that = this;
    var services = [];

    var infoService = new Service.AccessoryInformation();
    infoService
        .setCharacteristic(Characteristic.Manufacturer, "XiaoMi")
        .setCharacteristic(Characteristic.Model, "AirPurifier2S")
        .setCharacteristic(Characteristic.SerialNumber, "Undefined");
    services.push(infoService);

    var silentModeSwitch = new Service.Switch(this.silentModeSwitchName);
    var silentModeOnCharacteristic = silentModeSwitch.getCharacteristic(Characteristic.On);
    if(!this.silentModeSwitchDisable) {
        services.push(silentModeSwitch);
    }
    
    var airPurifierService = new Service.AirPurifier(this.name);
    var activeCharacteristic = airPurifierService.getCharacteristic(Characteristic.Active);
    var currentAirPurifierStateCharacteristic = airPurifierService.getCharacteristic(Characteristic.CurrentAirPurifierState);
    var targetAirPurifierStateCharacteristic = airPurifierService.getCharacteristic(Characteristic.TargetAirPurifierState);
    var lockPhysicalControlsCharacteristic = airPurifierService.addCharacteristic(Characteristic.LockPhysicalControls);
    var rotationSpeedCharacteristic = airPurifierService.addCharacteristic(Characteristic.RotationSpeed);
    
    var currentTemperatureCharacteristic = airPurifierService.addCharacteristic(Characteristic.CurrentTemperature);
    var currentRelativeHumidityCharacteristic = airPurifierService.addCharacteristic(Characteristic.CurrentRelativeHumidity);
    var pm25DensityCharacteristic = airPurifierService.addCharacteristic(Characteristic.PM2_5Density);
    var airQualityCharacteristic = airPurifierService.addCharacteristic(Characteristic.AirQuality);
    services.push(airPurifierService);

    setInterval(function() {
        that.device.getProps(["mode", "power", "child_lock", "favorite_level", "temp_dec", "humidity", "aqi", "filter1_life", "volume", "led"], true).then(result => {
            activeCharacteristic.getValue();
            currentAirPurifierStateCharacteristic.getValue();
            targetAirPurifierStateCharacteristic.getValue();
            lockPhysicalControlsCharacteristic.getValue();
            rotationSpeedCharacteristic.getValue();
            currentTemperatureCharacteristic.getValue();
            currentRelativeHumidityCharacteristic.getValue();
            pm25DensityCharacteristic.getValue();
            airQualityCharacteristic.getValue();
        }).catch(function(err) {
            that.logError("Polling failed: " + err);
        });
    }, 5000);
    
    silentModeOnCharacteristic
        .on('get', function(callback) {
            that.device.getProps(["mode"]).then(result => {
                that.logDebug("SilentModeSwitch - getOn: " + result);
                
                if(result[0] === "silent") {
                    callback(null, true);
                } else {
                    callback(null, false);
                }
            }).catch(function(err) {
                that.logError("SilentModeSwitch - getOn Error: " + err);
                callback(err);
            });
        }.bind(this))
        .on('set', function(value, callback) {
            that.logDebug("SilentModeSwitch - setOn: " + value);
            if(value) {
                that.device.setCache("mode", "silent");
                that.device.call("set_mode", ["silent"]).then(result => {
                    that.logDebug("SilentModeSwitch - setOn Result: " + result);
                    if(result[0] === "ok") {
                        targetAirPurifierStateCharacteristic.updateValue(Characteristic.TargetAirPurifierState.AUTO);
                        callback(null);
                        
                        if(Characteristic.Active.INACTIVE == activeCharacteristic.value) {
                            activeCharacteristic.updateValue(Characteristic.Active.ACTIVE);
                            currentAirPurifierStateCharacteristic.updateValue(Characteristic.CurrentAirPurifierState.PURIFYING_AIR);
                        }
                    } else {
                        callback(new Error(result[0]));
                    }
                }).catch(function(err) {
                    that.logError("SilentModeSwitch - setOn Error: " + err);
                    callback(err);
                });
            } else {
                if(Characteristic.Active.INACTIVE == activeCharacteristic.value) {
                    callback(null);
                } else {
                    const newMode = (Characteristic.TargetAirPurifierState.AUTO == targetAirPurifierStateCharacteristic.value ? "auto" : "favorite");
                    that.device.setCache("mode", newMode);
                    that.device.call("set_mode", [newMode]).then(result => {
                        that.logDebug("SilentModeSwitch - setOn Result: " + result);
                        if(result[0] === "ok") {
                            callback(null);
                        } else {
                            callback(new Error(result[0]));
                        }
                    }).catch(function(err) {
                        that.logError("SilentModeSwitch - setOn Error: " + err);
                        callback(err);
                    });
                }
            }
        }.bind(this));
    
    activeCharacteristic
        .on('get', function(callback) {
            that.device.getProps(["power"]).then(result => {
                that.logDebug("Active - getActive: " + result);
                
                if(result[0] === "off") {
                    callback(null, Characteristic.Active.INACTIVE);
                } else {
                    callback(null, Characteristic.Active.ACTIVE);
                }
            }).catch(function(err) {
                that.logError("Active - getActive Error: " + err);
                callback(err);
            });
        }.bind(this))
        .on('set', function(value, callback) {
            const newPower = (value ? "on" : "off");
            that.device.setCache("power", newPower);
            that.logDebug("Active - setActive: " + value);
            that.device.call("set_power", [newPower]).then(result => {
                that.logDebug("Active - setActive Result: " + result);
                if(result[0] === "ok") {
                    currentAirPurifierStateCharacteristic.updateValue(Characteristic.CurrentAirPurifierState.IDLE);
                    callback(null);
                    if(value) {
                        currentAirPurifierStateCharacteristic.updateValue(Characteristic.CurrentAirPurifierState.PURIFYING_AIR);
                        that.device.getProps(["mode"]).then(result => {
                            if(result[0] === "silent") {
                                silentModeOnCharacteristic.updateValue(true);
                            } else {
                                silentModeOnCharacteristic.updateValue(false);
                            }
                        }).catch(function(err) {
                            that.logError("Active - setActive Error: " + err);
                            callback(err);
                        });
                    } else {
                        currentAirPurifierStateCharacteristic.updateValue(Characteristic.CurrentAirPurifierState.INACTIVE);
                        silentModeOnCharacteristic.updateValue(false);
                    }
                } else {
                    callback(new Error(result[0]));
                }
            }).catch(function(err) {
                that.logError("Active - setActive Error: " + err);
                callback(err);
            });
        }.bind(this));
       
    currentAirPurifierStateCharacteristic
        .on('get', function(callback) {
            that.device.getProps(["power"]).then(result => {
                that.logDebug("CurrentAirPurifierState - getCurrentAirPurifierState: " + result);
                
                if(result[0] === "off") {
                    callback(null, Characteristic.CurrentAirPurifierState.INACTIVE);
                } else {
                    callback(null, Characteristic.CurrentAirPurifierState.PURIFYING_AIR);
                }
            }).catch(function(err) {
                that.logError("CurrentAirPurifierState - getCurrentAirPurifierState Error: " + err);
                callback(err);
            });
        }.bind(this));

    lockPhysicalControlsCharacteristic
        .on('get', function(callback) {
            that.device.getProps(["child_lock"]).then(result => {
                that.logDebug("LockPhysicalControls - getLockPhysicalControls: " + result);
                callback(null, result[0] === "on" ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED : Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED);
            }).catch(function(err) {
                that.logError("LockPhysicalControls - getLockPhysicalControls Error: " + err);
                callback(err);
            });
        }.bind(this))
        .on('set', function(value, callback) {
            const newValue = (value ? "on" : "off");
            that.device.setCache("child_lock", newValue);
            that.device.call("set_child_lock", [newValue]).then(result => {
                that.logDebug("LockPhysicalControls - setLockPhysicalControls Result: " + result);
                if(result[0] === "ok") {
                    callback(null);
                } else {
                    callback(new Error(result[0]));
                }
            }).catch(function(err) {
                that.logError("LockPhysicalControls - setLockPhysicalControls Error: " + err);
                callback(err);
            });
        }.bind(this));
        
    targetAirPurifierStateCharacteristic
        .on('get', function(callback) {
            that.device.getProps(["mode"]).then(result => {
                that.logDebug("TargetAirPurifierState - getTargetAirPurifierState: " + result);
                
                if(result[0] === "favorite") {
                    callback(null, Characteristic.TargetAirPurifierState.MANUAL);
                } else {
                    callback(null, Characteristic.TargetAirPurifierState.AUTO);
                }
            }).catch(function(err) {
                that.logError("TargetAirPurifierState - getTargetAirPurifierState: " + err);
                callback(err);
            });
        }.bind(this))
        .on('set', function(value, callback) {
            const newMode = (Characteristic.TargetAirPurifierState.AUTO == value ? (silentModeOnCharacteristic.value ? "silent" : "auto") : "favorite");
            that.logDebug("TargetAirPurifierState - setTargetAirPurifierState: " + value);
            that.device.setCache("mode", newMode);
            that.device.call("set_mode", [newMode]).then(result => {
                that.logDebug("TargetAirPurifierState - setTargetAirPurifierState Result: " + result);
                if(result[0] === "ok") {
                    if(Characteristic.TargetAirPurifierState.AUTO == value) {
                        callback(null);
                    } else {
                        that.device.getProps(["favorite_level"]).then(result => {
                            that.logDebug("TargetAirPurifierState - getRotationSpeed: " + result);
                            silentModeOnCharacteristic.updateValue(false);
                            if(rotationSpeedCharacteristic.value <= result[0] * 10 && rotationSpeedCharacteristic.value > (result[0] - 1) * 10) {
                                callback(null);
                            } else {
                                rotationSpeedCharacteristic.value = result[0] * 10;
                                callback(null);
                            }
                        }).catch(function(err) {
                            that.logError("TargetAirPurifierState - getRotationSpeed: " + err);
                            callback(err);
                        });
                    }
                } else {
                    callback(new Error(result[0]));
                }
            }).catch(function(err) {
                that.logError("TargetAirPurifierState - setTargetAirPurifierState Error: " + err);
                callback(err);
            });
        }.bind(this));
    
    rotationSpeedCharacteristic
        .on('get', function(callback) {
            that.device.getProps(["favorite_level"]).then(result => {
                that.logDebug("RotationSpeed - getRotationSpeed: " + result);
                callback(null, that.getRotationSpeedByFavoriteLevel(parseInt(result[0]), rotationSpeedCharacteristic.value));
            }).catch(function(err) {
                that.logError("RotationSpeed - getRotationSpeed Error: " + err);
                callback(err);
            });
        }.bind(this))
        .on('set', function(value, callback) {
            that.logDebug("RotationSpeed - setRotationSpeed set: " + value);
            if(value == 0) {
                callback(null);
            } else {
                const newValue = that.getFavoriteLevelByRotationSpeed(value);
                that.device.setCache("favorite_level", newValue);
                that.device.call("set_level_favorite", [newValue]).then(result => {
                    that.logDebug("RotationSpeed - setRotationSpeed Result: " + result);
                    if(result[0] === "ok") {
//                      that.device.call("set_mode", ["favorite"]).then(result => {
//                          that.logDebug("RotationSpeed - setTargetAirPurifierState Result: " + result);
//                          if(result[0] === "ok") {
//                              targetAirPurifierStateCharacteristic.updateValue(Characteristic.TargetAirPurifierState.MANUAL);
//                              silentModeOnCharacteristic.updateValue(false);
                                callback(null);
//                          } else {
//                              callback(new Error(result[0]));
//                          }
//                      }).catch(function(err) {
//                          that.logError("RotationSpeed - setTargetAirPurifierState Error: " + err);
//                          callback(err);
//                      });
                    } else {
                        callback(new Error(result[0]));
                    }
                }).catch(function(err) {
                    that.logError("TargetAirPurifierState - getRotationSpeed: " + err);
                    callback(err);
                })
            }
        }.bind(this));

    currentTemperatureCharacteristic.on('get', function(callback) {
        this.device.getProps(["temp_dec"]).then(result => {
            that.logDebug("Temperature - getTemperature: " + result);
            callback(null, result[0] / 10);
        }).catch(function(err) {
            that.logError("Temperature - getTemperature Error: " + err);
            callback(err);
        });
    }.bind(this));

    currentRelativeHumidityCharacteristic
        .on('get', function(callback) {
            this.device.getProps(["humidity"]).then(result => {
                that.logDebug("Humidity - getHumidity: " + result);
                callback(null, result[0]);
            }).catch(function(err) {
                that.logError("Humidity - getHumidity Error: " + err);
                callback(err);
            });
        }.bind(this));

    pm25DensityCharacteristic
        .on('get', function(callback) {
            this.device.getProps(["aqi"]).then(result => {
                that.logDebug("aqi - getPM25Density: " + result);
                callback(null, result[0]);
                
                var airQualityValue = Characteristic.AirQuality.UNKNOWN;
                if(result[0] <= 50) {
                    airQualityValue = Characteristic.AirQuality.EXCELLENT;
                } else if(result[0] > 50 && result[0] <= 100) {
                    airQualityValue = Characteristic.AirQuality.GOOD;
                } else if(result[0] > 100 && result[0] <= 200) {
                    airQualityValue = Characteristic.AirQuality.FAIR;
                } else if(result[0] > 200 && result[0] <= 300) {
                    airQualityValue = Characteristic.AirQuality.INFERIOR;
                } else if(result[0] > 300) {
                    airQualityValue = Characteristic.AirQuality.POOR;
                } else {
                    airQualityValue = Characteristic.AirQuality.UNKNOWN;
                }
                airQualityCharacteristic.updateValue(airQualityValue);
            }).catch(function(err) {
                that.logError("aqi - getPM25Density Error: " + err);
                callback(err);
            });
        }.bind(this));

    // var filterMaintenanceService = new Service.FilterMaintenance(this.name);
    var filterChangeIndicationCharacteristic = airPurifierService.getCharacteristic(Characteristic.FilterChangeIndication);
    var filterLifeLevelCharacteristic = airPurifierService.addCharacteristic(Characteristic.FilterLifeLevel);

    filterChangeIndicationCharacteristic
        .on('get', function(callback) {
            that.device.getProps(["filter1_life"]).then(result => {
                that.logDebug("FilterChangeIndication - getFilterChangeIndication: " + result);
                callback(null, result[0] < 5 ? Characteristic.FilterChangeIndication.CHANGE_FILTER : Characteristic.FilterChangeIndication.FILTER_OK);
            }).catch(function(err) {
                that.logError("FilterChangeIndication - getFilterChangeIndication Error: " + err);
                callback(err);
            });
        }.bind(this));
    filterLifeLevelCharacteristic
        .on('get', function(callback) {
            that.device.getProps(["filter1_life"]).then(result => {
                that.logDebug("FilterLifeLevel - getFilterLifeLevel: " + result);
                callback(null, result[0]);
            }).catch(function(err) {
                that.logError("FilterLifeLevel - getFilterLifeLevel Error: " + err);
                callback(err);
            });
        }.bind(this));
    // services.push(filterMaintenanceService);

    return services;
}

MiAirPurifier2SAirPurifierAccessory.prototype.getFavoriteLevelByRotationSpeed = function(rotationSpeed) {
    if(this.frm.length < 2) {
        return 1;
    }
    
    for(var i = 1; i< this.frm.length; i++) {
        if(rotationSpeed > this.frm[i-1] && rotationSpeed <= this.frm[i]) {
            return i;
        }
    }
    
    return 1;
}

MiAirPurifier2SAirPurifierAccessory.prototype.getRotationSpeedByFavoriteLevel = function(favoriteLevel, rotationSpeed) {
    if(this.frm.length < 2) {
        return 1;
    }
    
    if(rotationSpeed > this.frm[favoriteLevel-1] && rotationSpeed <= this.frm[favoriteLevel]) {
        return rotationSpeed;
    } else {
        return this.frm[favoriteLevel];
    }

}

MiAirPurifier2STemperatureAccessory = function(dThis) {
    this.device = dThis.device;
    this.name = dThis.config['temperatureName'];
    this.platform = dThis.platform;
    this.logDebug = dThis.logDebug;
    this.logError = dThis.logError;
}

MiAirPurifier2STemperatureAccessory.prototype.getServices = function() {
    var services = [];

    var infoService = new Service.AccessoryInformation();
    infoService
        .setCharacteristic(Characteristic.Manufacturer, "XiaoMi")
        .setCharacteristic(Characteristic.Model, "AirPurifier2S")
        .setCharacteristic(Characteristic.SerialNumber, "Undefined");
    services.push(infoService);
    
    var temperatureService = new Service.TemperatureSensor(this.name);
    temperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getTemperature.bind(this))
    services.push(temperatureService);
    
    return services;
}

MiAirPurifier2STemperatureAccessory.prototype.getTemperature = function(callback) {
    var that = this;
    this.device.getProps(["temp_dec"]).then(result => {
        that.logDebug("Temperature - getTemperature: " + result);
        callback(null, result[0] / 10);
    }).catch(function(err) {
        that.logError("Temperature - getTemperature Error: " + err);
        callback(err);
    });
}

MiAirPurifier2SHumidityAccessory = function(dThis) {
    this.device = dThis.device;
    this.name = dThis.config['humidityName'];
    this.platform = dThis.platform;
    this.logDebug = dThis.logDebug;
    this.logError = dThis.logError;
}

MiAirPurifier2SHumidityAccessory.prototype.getServices = function() {
    var services = [];

    var infoService = new Service.AccessoryInformation();
    infoService
        .setCharacteristic(Characteristic.Manufacturer, "XiaoMi")
        .setCharacteristic(Characteristic.Model, "AirPurifier2S")
        .setCharacteristic(Characteristic.SerialNumber, "Undefined");
    services.push(infoService);
    
    var humidityService = new Service.HumiditySensor(this.name);
    humidityService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.getHumidity.bind(this))
    services.push(humidityService);

    return services;
}

MiAirPurifier2SHumidityAccessory.prototype.getHumidity = function(callback) {
    var that = this;
    this.device.getProps(["humidity"]).then(result => {
        that.logDebug("getHumidity: " + result);
        callback(null, result[0]);
    }).catch(function(err) {
        that.logError("getHumidity Error: " + err);
        callback(err);
    });
}

MiAirPurifier2SBuzzerSwitchAccessory = function(dThis) {
    this.device = dThis.device;
    this.name = dThis.config['buzzerSwitchName'];
    this.platform = dThis.platform;
    this.logDebug = dThis.logDebug;
    this.logError = dThis.logError;
}

MiAirPurifier2SBuzzerSwitchAccessory.prototype.getServices = function() {
    var services = [];

    var infoService = new Service.AccessoryInformation();
    infoService
        .setCharacteristic(Characteristic.Manufacturer, "XiaoMi")
        .setCharacteristic(Characteristic.Model, "AirPurifier2")
        .setCharacteristic(Characteristic.SerialNumber, "Undefined");
    services.push(infoService);
    
    var switchService = new Service.Switch(this.name);
    switchService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getBuzzerState.bind(this))
        .on('set', this.setBuzzerState.bind(this));
    services.push(switchService);

    return services;
}

MiAirPurifier2SBuzzerSwitchAccessory.prototype.getBuzzerState = function(callback) {
    var that = this;
    this.device.getProps(["volume"]).then(result => {
        that.logDebug("getBuzzerState: " + result);
        callback(null, result[0] === "on" ? true : false);
    }).catch(function(err) {
        that.logError("getBuzzerState Error: " + err);
        callback(err);
    });
}

MiAirPurifier2SBuzzerSwitchAccessory.prototype.setBuzzerState = function(value, callback) {
    var that = this;
    that.logDebug("setBuzzerState: " + value);
    that.device.call("set_buzzer", [value ? "on" : "off"]).then(result => {
        that.logDebug("setBuzzerState Result: " + result);
        if(result[0] === "ok") {
            callback(null);
        } else {
            callback(new Error(result[0]));
        }
    }).catch(function(err) {
        that.logError("setBuzzerState Error: " + err);
        callback(err);
    });
}

MiAirPurifier2SLEDBulbAccessory = function(dThis) {
    this.device = dThis.device;
    this.name = dThis.config['ledBulbName'];
    this.platform = dThis.platform;
    this.logDebug = dThis.logDebug;
    this.logError = dThis.logError;
}

MiAirPurifier2SLEDBulbAccessory.prototype.getServices = function() {
    var that = this;
    var services = [];

    var infoService = new Service.AccessoryInformation();
    infoService
        .setCharacteristic(Characteristic.Manufacturer, "XiaoMi")
        .setCharacteristic(Characteristic.Model, "AirPurifier2S")
        .setCharacteristic(Characteristic.SerialNumber, "Undefined");
    services.push(infoService);
    
    var switchLEDService = new Service.Lightbulb(this.name);
    var onCharacteristic = switchLEDService.getCharacteristic(Characteristic.On);
    
    onCharacteristic
        .on('get', function(callback) {
            this.device.getProps(["led"]).then(result => {
                that.logDebug("switchLED - getLEDPower: " + result);
                callback(null, result[0] === "on" ? true : false);
            }).catch(function(err) {
                that.logError("getLEDPower Error: " + err);
                callback(err);
            });
        }.bind(this))
        .on('set', function(value, callback) {
            that.logDebug("switchLED - setLEDPower: " + value + ", nowValue: " + onCharacteristic.value);
            this.device.call("set_led", [value ? "on" : "off"]).then(result => {
                that.logDebug("switchLED - setLEDPower Result: " + result);
                if(result[0] === "ok") {
                    callback(null);
                } else {
                    callback(new Error(result[0]));
                }
            }).catch(function(err) {
                that.logError("setLEDPower Error: " + err);
                callback(err);
            });
        }.bind(this));
    services.push(switchLEDService);

    return services;
}

MiAirPurifier2SAirQualityAccessory = function(dThis) {
    this.device = dThis.device;
    this.name = dThis.config['airQualityName'];
    this.platform = dThis.platform;
    this.logDebug = dThis.logDebug;
    this.logError = dThis.logError;
}

MiAirPurifier2SAirQualityAccessory.prototype.getServices = function() {
    var that = this;
    var services = [];
    
    var infoService = new Service.AccessoryInformation();
    infoService
        .setCharacteristic(Characteristic.Manufacturer, "XiaoMi")
        .setCharacteristic(Characteristic.Model, "AirPurifier2S")
        .setCharacteristic(Characteristic.SerialNumber, "Undefined");
    services.push(infoService);
    
    var pmService = new Service.AirQualitySensor(this.name);
    var pm2_5Characteristic = pmService.addCharacteristic(Characteristic.PM2_5Density);
    pmService
        .getCharacteristic(Characteristic.AirQuality)
        .on('get', function(callback) {
            that.device.getProps(["aqi"]).then(result => {
                that.logDebug("getAirQuality: " + result);
                
                pm2_5Characteristic.updateValue(result[0]);
                
                if(result[0] <= 50) {
                    callback(null, Characteristic.AirQuality.EXCELLENT);
                } else if(result[0] > 50 && result[0] <= 100) {
                    callback(null, Characteristic.AirQuality.GOOD);
                } else if(result[0] > 100 && result[0] <= 200) {
                    callback(null, Characteristic.AirQuality.FAIR);
                } else if(result[0] > 200 && result[0] <= 300) {
                    callback(null, Characteristic.AirQuality.INFERIOR);
                } else if(result[0] > 300) {
                    callback(null, Characteristic.AirQuality.POOR);
                } else {
                    callback(null, Characteristic.AirQuality.UNKNOWN);
                }
            }).catch(function(err) {
                that.logError("getAirQuality Error: " + err);
                callback(err);
            });
        }.bind(this));
    services.push(pmService);

    return services;
}
