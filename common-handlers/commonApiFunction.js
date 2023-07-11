
const reporterSchema = require('../modals/reportersSchema');
const metaDataSchema = require('../modals/metaDataSchema');
const newsDataSchema = require('../modals/newsDataSchema');
const subscriberDataSchema = require('../modals/subscriberDataSchema');
// const user = require('../modals/userSchema')

const registerReporter = async (req, res) => {
    try {
        let data = JSON.parse(JSON.stringify(req.body));
        let checkMail = await reporterSchema.findOne({
            mail: data.mail
        });
        if (!checkMail) {
            let users = await reporterSchema.find({
                'state': data['state']
            })
            data['employeeId'] = 'NC-' + data['state'] + '-' + (users.length ? users.length + 1 : 1);
            data['createdOn'] = new Date().getTime();
            const task = await reporterSchema.create({
                ...data
            }) //pushing data to DB           
            const token = task.createJwt();
            res.cookie("tokens", token, {
                httpOnly: true,
            }).status(200).json({
                status: "success",
                msg: "Registered successfully..! You will get a confirmation as soon as accepeted.."
            }).send(task).save(task);
        } else {
            res.status(200).json({
                status: "failed",
                msg: 'Mail already registered. Try contacting your higher authority.'
            })
        }

    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Failed while generating Employee ID'
        })
    }
}

const reporterLogin = async (req, res) => {
    try {

        const {
            mail,
            password
        } = req.body;
        const userData = await reporterSchema.findOne({
            mail
        }) //returns single object
        if (!userData) {
            res.status(200).json({
                status: "failed",
                msg: 'Invalid Username or Password!'
            })
        } else {
            const verifyPassword = await userData.compare(password);
            if (!verifyPassword) {
                res.status(200).json({
                    status: "failed",
                    msg: 'Invalid Credentials'
                })
            } else if (userData.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!userData.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {
                let userDataCopy = JSON.parse(JSON.stringify(userData));
                let deleteElements = ['_id', 'password', 'passwordCopy', '__v', 'createdDate'];
                deleteElements.forEach(element => {
                    if (userDataCopy[element]) {
                        delete userDataCopy[element]
                    }
                })
                res.status(200).json({
                    status: "success",
                    msg: 'successfully logged in',
                    data: userDataCopy
                })
            }
        }
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while logging in! Try after some time.'
        })

    }
}

const getMetaData = async (req, res) => {
    try {
        let metaData = {}
        for (let index = 0; index < req.body.metaList.length; index++) {
            let value = await metaDataSchema.findOne({
                type: req.body.metaList[index]
            })
            metaData[req.body.metaList[index]] = value['data'];
        }
        if (req.body.metaList.length === Object.keys(metaData).length) {
            res.status(200).json({
                status: "success",
                msg: 'success',
                data: metaData
            })
        } else {
            res.status(200).json({
                status: "failed",
                msg: 'Error while processing!'
            })

        }

    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while loading!'
        })

    }

}

const publishNews = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {
                if (body.type === 'create') {
                    
                    const existingNews = await newsDataSchema.find();
                    if (existingNews && existingNews.length > 0) {
                        body['data']['newsId'] = (existingNews.length + 1);
                    } else {
                        body['data']['newsId'] = 1;
                    };
                    body['data']['employeeId'] = body.employeeId;
                    const task = await newsDataSchema.create({
                        ...body.data
                    });
                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        task: task
                    });
                } else if (body.type === 'approve'){
                    let task = await newsDataSchema.updateOne({ newsId: body.data.newsId },
                        {
                            approved: true,
                            approvedBy: body.employeeId,
                            approvedOn: new Date().getTime(),
                            // lastUpdatedBy: data.employeeId,
                            rejected: false,
                            rejectedOn: '',
                            rejectedReason: '',
                            rejectedBy: ''
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Approved..!',
                        data: task
                    });
                } else if (body.type === 'reject') {
                    let task = await newsDataSchema.updateOne({ newsId: body.data.newsId },
                        {
                            approved: false,
                            approvedBy: '',
                            approvedOn: '',
                            rejected: true,
                            rejectedOn: new Date().getTime(),
                            rejectedReason: body.data.reason,
                            rejectedBy: body.employeeId
                        }
                        )
                    res.status(200).json({
                        status: "success",
                        msg: 'Rejected..!',
                        data: task
                    });
                } else if (body.type === 'update') {
                    let task = await newsDataSchema.updateOne({ newsId: body.data.newsId },
                        {
                            approved: false,
                            approvedBy: '',
                            approvedOn: '',
                            rejected: false,
                            rejectedOn: '',
                            rejectedReason: '',
                            rejectedBy: '',
                            lastUpdatedBy: body.employeeId,
                            lastUpdatedOn: new Date().getTime(),
                            title: body.data.title,
                            sub_title: body.data.sub_title,
                            description: body.data.description,
                            images: body.data.images
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Updates..!',
                        data: task
                    });
                }
            }
        }
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing..! ',
            error: error
        })
    }
}

// getNewsInfo

const getNewsInfo = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let newsContent = await newsDataSchema.findOne().where('newsId').equals(body.newsId);
                res.status(200).json({
                    status: "success",
                    msg: 'News Fetched successfully..!',
                    data: newsContent
                })

            }
        }
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing..! ',
            error: error
        })
    }
}
const getNewsList = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let responseData = {
                    approvedNews: {
                        "tableData": {

                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },
                                {
                                    "label": "Approved On",
                                    "key": "approvedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Approved By",
                                    "key": "approvedBy"
                                },

                            ]
                        }
                    },
                    notApprovedNews: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },
                                {
                                    "label": "Last Updated On",
                                    "key": "lastUpdatedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Last Updated By",
                                    "key": "lastUpdatedBy"
                                }
                            ]
                        }
                    },
                    rejectedNews: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },

                                {
                                    "label": "Rejected On",
                                    "key": "rejectedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Rejected By",
                                    "key": "rejectedBy"
                                },
                                {
                                    "label": "Reason",
                                    "key": "rejectedReason"
                                },

                            ]
                        }
                    },
                }

                if (body.role === 'CEO' || body.role === 'INCHARGE DIRECTOR') {
                    const approvedLst = await newsDataSchema.find(
                        {
                            approved: true,
                            rejected: false
                        }

                    ).where('approved').equals(true).where('rejected').equals(false);
                    responseData.approvedNews.tableData['bodyContent'] = await stateDistrictMapping(approvedLst, [])
                    const ntApprovedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: false
                        },

                    );
                    responseData.notApprovedNews.tableData['bodyContent'] = await stateDistrictMapping(ntApprovedLst, []);
                    const rejectedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: { $in: [true] }
                        },

                    );
                    responseData.rejectedNews.tableData['bodyContent'] = await stateDistrictMapping(rejectedLst, []);
                    responseData['approvedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                icon: "visibility",
                                key: "view",
                                class: "btn btn-info"
                            }
                        ]
                    }
                    responseData['notApprovedNews']['metaData'] = {
                        title: "Pending News",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "task_alt",
                                key: "approve",
                                class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Reject",
                                key: "reject",
                                class: "btn btn-danger",
                                icon: "dangerous",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                class: "btn btn-info",
                                icon: "edit_square",
                                // disable: {
                                //     role: ['REPORTER']
                                // }
                            }
                        ]
                    }
                    responseData['rejectedNews']['metaData'] = {
                        title: "Rejected News",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "task_alt",
                                key: "approve",
                                class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            }
                        ]
                    }
                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                }
                else if (body.role === 'DISTRICT MANAGER' || body.role === 'ADVERTISEMENT MANAGER') {

                } else if (body.role === 'REPORTER') {

                }

            }
        }
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing..! ',
            error: error
        })
    }
}

const getAllEmployees = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let allEmployees = await reporterSchema.find().where('activeUser').equals(true);
                let responseData = await stateDistrictMapping(allEmployees, [], ['_id', 'password', 'passwordCopy', 'createdOn', 'activeUser', 'disabledUser', '__v', 'disabledBy', 'disabledOn', 'lastUpdatedBy', 'lastUpdatedOn'])
                res.status(200).json({
                    status: "success",
                    msg: 'Listed',
                    data: responseData
                });


            }
        }
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing..! ',
            error: error
        })
    }
}

const fetchDashboard = async (req, res) => {
    try {
        let responseData = {
            dashboardCount: {}
        };
        let todaysStart = new Date();
        todaysStart.setHours(0);
        todaysStart.setMinutes(0);
        todaysStart.setSeconds(0);
        if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {
            responseData.dashboardCount.employees = (await reporterSchema.find()).length;
            responseData.dashboardCount.activeEmployees = (await reporterSchema.find().where('activeUser').equals(true)).length;
            responseData.dashboardCount.todaysNews = (await newsDataSchema.find().where('createdDate').gt(new Date(todaysStart).getTime())).length;
            responseData.dashboardCount.todaysNewsApproved = (await newsDataSchema.find().where('createdDate').gt(new Date(todaysStart).getTime()).where('approved').equals(true)).length;
            responseData.dashboardCount.totalNews = (await newsDataSchema.find()).length;
            responseData.dashboardCount.totalNewsApproved = (await newsDataSchema.find().where('approved').equals(true)).length;
            responseData.dashboardCount.contactsAll = (await subscriberDataSchema.find()).length;
            responseData.dashboardCount.contactsAdded = (await subscriberDataSchema.find().where('addedToGroup').equals(true)).length;
        } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
            responseData.dashboardCount.employees = (await reporterSchema.find(
                {
                    district: { $in: [req.body.district] }
                },

            )).length;
            responseData.dashboardCount.activeEmployees = (await reporterSchema.find(
                {
                    district: { $in: [req.body.district] },
                    activeUser: true
                }
            )).length; responseData.dashboardCount.todaysNews = (await newsDataSchema.find().where('createdDate').gt(new Date(todaysStart).getTime()).where('district').equals(req.body.district)).length;
            responseData.dashboardCount.todaysNewsApproved = (await newsDataSchema.find().where('createdDate').gt(new Date(todaysStart).getTime()).where('district').equals(req.body.district).where('approved').equals(true)).length;
            responseData.dashboardCount.totalNews = (await newsDataSchema.find().where('district').equals(req.body.district)).length;
            responseData.dashboardCount.totalNewsApproved = (await newsDataSchema.find().where('district').equals(req.body.district).where('approved').equals(true)).length;
            responseData.dashboardCount.contactsAll = (await subscriberDataSchema.find().where('district').equals(req.body.district)).length;
            responseData.dashboardCount.contactsAdded = (await subscriberDataSchema.find().where('district').equals(req.body.district).where('addedToGroup').equals(true)).length;
        } else if (req.body.role === 'REPORTER') {
            // responseData.dashboardCount.reporters = (await reporterSchema.find().where('mandal').equals(req.body.mandal)).length;
            responseData.dashboardCount.todaysNews = (await newsDataSchema.find().where('createdDate').gt(new Date(todaysStart).getTime()).where('employeeId').equals(req.body.employeeId)).length;
            responseData.dashboardCount.todaysNewsApproved = (await newsDataSchema.find().where('createdDate').gt(new Date(todaysStart).getTime()).where('employeeId').equals(req.body.employeeId).where('approved').equals(true)).length;
            responseData.dashboardCount.totalNews = (await newsDataSchema.find().where('employeeId').equals(req.body.employeeId)).length;
            responseData.dashboardCount.totalNewsApproved = (await newsDataSchema.find().where('employeeId').equals(req.body.employeeId).where('approved').equals(true)).length;
            responseData.dashboardCount.contactsAll = (await subscriberDataSchema.find().where('district').equals(req.body.district)).length;
            responseData.dashboardCount.contactsAdded = (await subscriberDataSchema.find().where('district').equals(req.body.district).where('addedToGroup').equals(true)).length;
        }

        let chartInfos = []

        if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {
            const states = await metaDataSchema.findOne({
                type: "STATES"
            });
            let stateID = [];
            let approvedNews = [];
            let notApprovedNews = [];
            const startAndEnd = getRecentOneMonthEpoch();

            let addedContacts = [];
            let notAddedContacts = [];
            for (let index = 0; index < states['data'].length; index++) {
                stateID.push(states['data'][index].value);
                const approved = await newsDataSchema.find().where('state').equals(states['data'][index].value).where('approved').equals(true).where('createdDate').gt(startAndEnd.oneMonthAgoEpochTime).lt(startAndEnd.presentEpochTime)
                approvedNews.push(approved.length)
                const nonapproved = await newsDataSchema.find().where('state').equals(states['data'][index].value).where('approved').equals(false).where('createdDate').gt(startAndEnd.oneMonthAgoEpochTime).lt(startAndEnd.presentEpochTime)
                notApprovedNews.push(nonapproved.length);

                const addedContactsList = await subscriberDataSchema.find().where('state').equals(states['data'][index].value).where('addedToGroup').equals(true)
                addedContacts.push(addedContactsList.length)
                const notAddedContactsList = await subscriberDataSchema.find().where('state').equals(states['data'][index].value).where('addedToGroup').equals(false)
                notAddedContacts.push(notAddedContactsList.length)
            }
            chartInfos.push({
                title: "State wise news",
                description: "State wise news for the past one month",
                type: "state_wise_chart",
                chartData: {}
            })

            chartInfos[0]['chartData'] = await multiBarChart({
                type: "category",
                value: stateID
            }, [{
                name: "Approved",
                value: approvedNews
            }, {
                name: "Not Approved",
                value: notApprovedNews
            }])
            const myDtList = await metaDataSchema.findOne({
                type: req.body.state + "_DISTRICTS"
            });
            let myDistricts = myDtList['data']
            let myDistrictIds = [];
            let myDistrictApprovedNews = []
            let myDistrictNotApprovedNews = []
            for (let index = 0; index < myDistricts.length; index++) {
                myDistrictIds.push(myDistricts[index].value);
                const approved = await newsDataSchema.find().where('district').equals(myDistricts[index].value).where('approved').equals(true).where('createdDate').gt(startAndEnd.oneMonthAgoEpochTime).lt(startAndEnd.presentEpochTime)
                myDistrictApprovedNews.push(approved.length)
                const nonapproved = await newsDataSchema.find().where('district').equals(myDistricts[index].value).where('approved').equals(false).where('createdDate').gt(startAndEnd.oneMonthAgoEpochTime).lt(startAndEnd.presentEpochTime)
                myDistrictNotApprovedNews.push(nonapproved.length);

            }
            chartInfos.push({
                title: "District wise news",
                description: "District wise news for the past one month",
                type: "district_wise_chart",
                // customClass:"col-md-8",
                chartData: {}
            })
            chartInfos[1]['chartData'] = await multiBarChart({
                type: "category",
                value: myDistrictIds
            }, [{
                name: "Approved",
                value: myDistrictApprovedNews
            }, {
                name: "Not Approved",
                value: myDistrictNotApprovedNews
            }])
            responseData['chartInfos'] = chartInfos
            res.status(200).json({
                status: "success",
                msg: 'Successfully fetched. ',
                data: responseData
            })
        } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
            res.status(200).json({
                status: "success",
                msg: 'Successfully fetched. ',
                data: responseData
            })
        } else if (req.body.role === 'REPORTER') {
            res.status(200).json({
                status: "success",
                msg: 'Successfully fetched. ',
                data: responseData
            })
        }



    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..! ',
            error: error
        })

    }
}

const multiBarChart = async (xaxis, yaxisArray) => {
    let chartData = {
        "tooltip": {
            "trigger": "axis",
            "axisPointer": {
                "type": "shadow"
            }
        },
        "xAxis": [{
            "type": xaxis.type,
            "axisTick": {
                "show": false
            },
            axisLabel: {
                textStyle: {
                    color: 'white'
                }
            },
            "data": xaxis.value
        }],
        "yAxis": [{
            "type": "value",
            axisLabel: {
                textStyle: {
                    color: 'white'
                }
            },
        }],
        dataZoom: {

            type: "inside",
            disabled: false
        },
        "series": [

        ]
    }

    yaxisArray.forEach(elem => {
        chartData.series.push({
            "name": elem.name,
            "type": "bar",
            "barGap": 0,
            "label": {
                "show": true,
                "position": "insideBottom",
                "distance": 15,
                "align": "left",
                "verticalAlign": "middle",
                "rotate": 90,
                "formatter": "{c}  {name|{a}}",
                "fontSize": 16,
                "rich": {
                    "name": {}
                }
            },
            "emphasis": {
                "focus": "series"
            },
            "data": elem.value
        })
    })
    return chartData;
}
const pieChartCircle = async (name, data) => {
    let chartData = {
        tooltip: {
            trigger: 'item'
        },
        series: [{
            name: 'Access From',
            type: 'pie',
            radius: ['60%', '90%'],


            itemStyle: {
                borderRadius: 10,
                borderColor: '#fff',
                borderWidth: 2
            },
            data: [{
                value: 1048,
                name: 'Search Engine'
            },
            {
                value: 735,
                name: 'Direct'
            }

            ]
        }]
    }
}
const addSubscribers = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot process, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {
                // PERFROM ADDING HERE

                const addSubscriber = await subscriberDataSchema.create(req.body.data)
                if (!addSubscriber) {
                    res.status(200).json({
                        status: "failed",
                        msg: 'Duplications found!'
                    })
                }
                // const existingNews = await newsDataSchema.find({ employeeId: body.data.employeeId }).sort({ newsId: -1 });
                // if (existingNews && existingNews.length > 0) {
                //     body['data']['newsId'] = (existingNews[0].newsId + 1);
                // } else {
                //     body['data']['newsId'] = 1;
                // }
                // const task = await newsDataSchema.create({ ...body.data });
                res.status(200).json({
                    status: "success",
                    msg: 'Contacts added to list...!'
                });
            }
        }
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}


const getEmployeesData = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot process, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let responseData = {
                    activeEmployees: {
                        "tableData": {

                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                }
                            ]
                        }
                    },
                    inActiveEmployees: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                }
                            ]
                        }
                    },
                    disabledEmployees: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                }
                            ]

                        }
                    }
                }
                if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {

                    let activeEmp = await reporterSchema.find().where('activeUser').equals(true).where('disabledUser').equals(false);
                    responseData['activeEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(activeEmp, [])
                    let inActiveEmp = await reporterSchema.find().where('activeUser').equals(false).where('disabledUser').equals(false);
                    responseData['inActiveEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(inActiveEmp, [])
                    let disabledEmp = await reporterSchema.find().where('disabledUser').equals(true);
                    responseData['disabledEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(disabledEmp, []);


                    // ACTIONS BELOW

                    responseData['activeEmployees']['metaData'] = {
                        title: "Active Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "In Active",
                                icon: "edit_off",
                                key: "inactive",
                                class: "btn btn-dark"
                            },
                            {
                                type: "button",
                                tooltip: "Disable",
                                key: "disable",
                                class: "btn btn-danger",
                                icon: "no_accounts",
                            }
                        ],
                        "createNew": {
                            type: "createNew",
                            label: "Add Employee",
                            icon: "add_circle",
                            key: "createNew",
                        }
                    }

                    responseData['inActiveEmployees']['metaData'] = {
                        title: "In Active Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Active",
                                key: "active",
                                class: "btn btn-success",
                                icon: "verified",

                            },
                            {
                                type: "button",
                                tooltip: "Disable",
                                key: "disable",
                                class: "btn btn-danger",
                                icon: "no_accounts",
                            }
                        ]
                    }
                    responseData['disabledEmployees']['metaData'] = {
                        title: "Disabled Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Enable",
                                key: "enable",
                                class: "btn btn-primary",
                                icon: "person_book"
                            }
                        ]
                    }
                    if (req.body.role === 'INCHARGE DIRECTOR') {
                        for (let index = 0; index < responseData['activeEmployees']['metaData']['actions'].length; index++) {
                            responseData['activeEmployees']['metaData']['actions'][index]['disable'] = {
                                role: ['CEO', 'INCHARGE DIRECTOR']
                            }
                        }
                        for (let index = 0; index < responseData['inActiveEmployees']['metaData']['actions'].length; index++) {
                            responseData['inActiveEmployees']['metaData']['actions'][index]['disable'] = {
                                role: ['CEO', 'INCHARGE DIRECTOR']
                            }
                        }
                        for (let index = 0; index < responseData['disabledEmployees']['metaData']['actions'].length; index++) {
                            responseData['disabledEmployees']['metaData']['actions'][index]['disable'] = {
                                role: ['CEO', 'INCHARGE DIRECTOR']
                            }
                        }
                    }
                    // disable: {
                    //     role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                    // }
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });


                } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
                    let activeEmp = await reporterSchema.find().where('district').equals(req.body.district).where('role').ne("CEO").where('role').ne("INCHARGE DIRECTOR").where('activeUser').equals(true).where('disabledUser').equals(false);
                    responseData['activeEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(activeEmp, [])
                    let inActiveEmp = await reporterSchema.find().where('district').equals(req.body.district).where('role').ne("CEO").where('role').ne("INCHARGE DIRECTOR").where('activeUser').equals(false).where('disabledUser').equals(false);
                    responseData['inActiveEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(inActiveEmp, [])
                    let disabledEmp = await reporterSchema.find().where('district').equals(req.body.district).where('role').ne("CEO").where('role').ne("INCHARGE DIRECTOR").where('disabledUser').equals(true);
                    responseData['disabledEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(disabledEmp, [])


                    // ACTIONS BELOW

                    responseData['activeEmployees']['metaData'] = {
                        title: "Active Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "In Active",
                                icon: "edit_off",
                                key: "inactive",
                                class: "btn btn-dark",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Disable",
                                key: "disable",
                                class: "btn btn-danger",
                                icon: "no_accounts",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            }
                        ],
                        "createNew": {
                            type: "createNew",
                            label: "Add Employee",
                            icon: "add_circle",
                            key: "createNew",
                        }
                    }
                    responseData['inActiveEmployees']['metaData'] = {
                        title: "In Active Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Active",
                                key: "active",
                                class: "btn btn-success",
                                icon: "verified",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Disable",
                                key: "disable",
                                class: "btn btn-danger",
                                icon: "no_accounts",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            }
                        ]
                    }
                    responseData['disabledEmployees']['metaData'] = {
                        title: "Disabled Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Enable",
                                key: "enable",
                                class: "btn btn-primary",
                                icon: "person_book",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            }
                        ]
                    }
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });

                } else if (req.body.role === 'REPORTER') {


                    res.status(200).json({
                        status: "failed",
                        msg: 'No Access...!'
                    });
                }

            }
        }
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const manipulateEmployee = async (req, res) => {
    try {

        let data = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: data.employeeId
        });

        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot process, contact your superior!'
            });
        } else {

            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {


                if (data.type === 'create') {

                    let checkMail = await reporterSchema.findOne({
                        mail: data.data.mail
                    });

                    if (!checkMail) {
                        let users = await reporterSchema.find({
                            'state': data.data['state']
                        })
                        data.data['employeeId'] = 'NC-' + data.data['state'] + '-' + (users.length ? users.length + 1 : 1);
                        data.data.createdBy = data.employeeId;
                        data['createdDate'] = new Date().getTime();

                        let task = await reporterSchema.create(data.data)



                        res.status(200).json({
                            status: "success",
                            msg: 'Employee Added...!',
                            data: task
                        });
                    } else {
                        res.status(200).json({
                            status: "failed",
                            msg: 'Employee alerady to registered...!'
                        });
                    }
                } else if (data.type === 'active') {
                    // to move user to active state, if disabled user make it false for disabled
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            activeUser: true,
                            disabledUser: false,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledBy: '',
                            disabledOn: ''
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Employee Enabled Successfully...!',
                        data: task
                    });
                } else if (data.type === 'inactive') {
                    // to move user to inactive state, if disabled user make it false for disabled
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            activeUser: false,
                            disabledUser: false,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledBy: '',
                            disabledOn: ''
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Employee Enabled Successfully...!',
                        data: task
                    });
                } else if (data.type === 'disable') {
                    // to move disable
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            activeUser: false,
                            disabledUser: true,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledOn: new Date().getTime(),
                            disabledBy: data.employeeId
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Employee Enabled Successfully...!',
                        data: task
                    });
                } else if (data.type === 'enable') {
                    // to move disable
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            activeUser: false,
                            disabledUser: false,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledBy: '',
                            disabledOn: ''
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Employee Enabled Successfully...!',
                        data: task
                    });
                }
            }
        }

    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const getEmployeeData = async (req, res) => {
    try {
        let data = JSON.parse(JSON.stringify(req.body));
        const userData = await reporterSchema.findOne({
            employeeId: data.data.employeeId
        })
        let deleteElements = ['_id', 'password', '__v', 'createdDate'];
        deleteElements.forEach(element => {
            if (userData[element] || userData[element] === 0) {
                delete userData[element]
            }
        })
        res.status(200).json({
            status: "success",
            data: userData
        });
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const getSubscribers = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {


                const responseData = {
                    headerContent: [{
                        key: "name",
                        label: "Name"
                    },
                    {
                        key: "state",
                        label: "State"
                    },
                    {
                        key: "district",
                        label: "District"
                    },
                    {
                        key: "mandal",
                        label: "Mandal"
                    },
                    {
                        key: "mobile",
                        label: "Mobile"
                    },
                    {
                        key: "addedToGroup",
                        label: "Added to Group"
                    }
                    ]
                }
                // PERFROM GET LIST SUBSCIRBERS
                if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {
                    let allSubscirbers = await subscriberDataSchema.find();
                    let allSubscirbersUpdated = await stateDistrictMapping(allSubscirbers, [])
                    responseData['bodyContent'] = allSubscirbersUpdated
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });
                } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
                    let allSubscirbers = await subscriberDataSchema.find().where('district').equals(req.body.district);
                    let allSubscirbersUpdated = await stateDistrictMapping(allSubscirbers, [])
                    responseData['bodyContent'] = allSubscirbersUpdated
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });
                } else if (req.body.role === 'REPORTER') {
                    let allSubscirbers = await subscriberDataSchema.find().where('district').equals(req.body.district).where('mandal').equals(req.body.mandal);
                    let allSubscirbersUpdated = await stateDistrictMapping(allSubscirbers, ['mobile'])
                    responseData['bodyContent'] = allSubscirbersUpdated
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });

                }
            }
        }
    } catch (error) {
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const stateDistrictMapping = async (value, hideFieldValues, deleteElementsList) => {
    let valueCopy = JSON.parse(JSON.stringify(value))
    let allSt = await metaDataSchema.findOne({
        type: "STATES"
    })
    let allStates = allSt['data'];
    let unqiueStateFromValue = findUniqueValues(value, "state");

    let allDistricts = {};
    for (let index = 0; index < unqiueStateFromValue.length; index++) {
        const dt = await metaDataSchema.findOne({
            type: unqiueStateFromValue[index] + "_DISTRICTS"
        })
        allDistricts[unqiueStateFromValue[index]] = dt['data'];
    };
    for (let index = 0; index < valueCopy.length; index++) {
        const distINdex = allDistricts[valueCopy[index]['state']].findIndex(ele => ele.value === valueCopy[index]['district']);
        if (distINdex > -1) {
            valueCopy[index]['district'] = allDistricts[valueCopy[index]['state']][distINdex].label;
        }
        const stateIndex = allStates.findIndex(ele => ele.value === valueCopy[index]['state']);
        if (stateIndex > -1) {
            valueCopy[index]["state"] = allStates[stateIndex].label;
        };
        if (hideFieldValues && hideFieldValues.length > 0) {
            hideFieldValues.forEach(elem => {
                if (valueCopy[index][elem]) {
                    valueCopy[index][elem] = "XXXXX";
                }
            })
        }
        let deleteElements = deleteElementsList ? deleteElementsList : ['_id', 'password', 'passwordCopy', '__v'];
        deleteElements.forEach(element => {
            if (valueCopy[index][element] || valueCopy[index][element] === 0 || valueCopy[index][element] === '' || valueCopy[index][element] === false) {
                delete valueCopy[index][element]
            }
        })
    };
    return valueCopy;
}

function findUniqueValues(objects, key) {
    const uniqueValues = new Set();

    objects.forEach(obj => {
        uniqueValues.add(obj[key]);
    });

    return Array.from(uniqueValues);
}

function getRecentOneMonthEpoch() {
    const presentEpochTime = Math.floor(Date.now()); // Divide by 1000 to convert milliseconds to seconds
    const oneMonthAgo = new Date();
    oneMonthAgo.setHours(0);
    oneMonthAgo.setMinutes(0);
    oneMonthAgo.setSeconds(0);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoEpochTime = Math.floor(oneMonthAgo.getTime());
    return {
        presentEpochTime,
        oneMonthAgoEpochTime
    };
}


module.exports = {
    registerReporter,
    reporterLogin,
    getMetaData,
    publishNews,
    fetchDashboard,
    addSubscribers,
    getSubscribers, getEmployeesData, manipulateEmployee, getEmployeeData, getNewsList, getAllEmployees, getNewsInfo
}