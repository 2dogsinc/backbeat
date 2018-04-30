const BucketInfo = require('arsenal').models.BucketInfo;
const querystring = require('querystring');
const URL = require('url');

const dummyBucketMD = {
    bucket1: {
        _acl: {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [] },
        _name: 'xxxfriday10',
        _owner:
            '94224c921648ada653f584f3caf42654ccf3f1cbd2e569a24e88eb460f2f84d8',
        _ownerDisplayName: 'test_1518720219',
        _creationDate: '2018-02-16T21:55:16.415Z',
        _mdBucketModelVersion: 5,
        _transient: false,
        _deleted: false,
        _serverSideEncryption: null,
        _versioningConfiguration: null,
        _locationConstraint: 'us-east-1',
        _websiteConfiguration: null,
        _replicationConfiguration: null,
        _cors: null,
        _lifecycleConfiguration: null,
        _uid: undefined,
    },
    bucket2: {
        _acl: {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [] },
        _name: 'xxxfriday10',
        _owner:
            '94224c921648ada653f584f3caf42654ccf3f1cbd2e569a24e88eb460f2f84d8',
        _ownerDisplayName: 'test_1518720219',
        _creationDate: '2018-02-16T21:55:16.415Z',
        _mdBucketModelVersion: 5,
        _transient: false,
        _deleted: false,
        _serverSideEncryption: null,
        _versioningConfiguration: null,
        _locationConstraint: 'us-east-1',
        _websiteConfiguration: null,
        _replicationConfiguration: null,
        _cors: null,
        _lifecycleConfiguration: null,
        _uid: undefined,
    },
};

const objectList = {
    Contents: [
        { key: 'testobject1',
        value: JSON.stringify({
            'owner-display-name': 'test_1518720219',
            'owner-id':
            '94224c921648ada653f584f3caf42654ccf3f1cbd2e569a24e88eb460f2f84d8',
            'content-length': 0,
            'content-md5': 'd41d8cd98f00b204e9800998ecf8427e',
            'x-amz-version-id': 'null',
            'x-amz-server-version-id': '',
            'x-amz-storage-class': 'STANDARD',
            'x-amz-server-side-encryption': '',
            'x-amz-server-side-encryption-aws-kms-key-id': '',
            'x-amz-server-side-encryption-customer-algorithm': '',
            'x-amz-website-redirect-location': '',
            'acl': {
                Canned: 'private',
                FULL_CONTROL: [],
                WRITE_ACP: [],
                READ: [],
                READ_ACP: [],
            },
            'key': '',
            'location': null,
            'isDeleteMarker': false,
            'tags': {},
            'replicationInfo': {
                status: '',
                backends: [],
                content: [],
                destination: '',
                storageClass: '',
                role: '',
                storageType: '',
                dataStoreVersionId: '',
            },
            'dataStoreName': 'us-east-1',
            'last-modified': '2018-02-16T22:43:37.174Z',
            'md-model-version': 3,
        }) },
    ],
};

const mockLogs = [
    {
        type: 'put',
        bucket: 'prom',
        key: 'f6',
        value: '{"owner-display-name":"test_1518720219","owner-id":' +
        '"94224c921648ada653f584f3caf42654ccf3f1cbd2e569a24e88eb460f2f84d8",' +
        '"content-length":0,"content-md5":"d41d8cd98f00b204e9800998ecf8427e",' +
        '"x-amz-version-id":"null","x-amz-server-version-id":"",' +
        '"x-amz-storage-class":"STANDARD","x-amz-server-side-encryption":"",' +
        '"x-amz-server-side-encryption-aws-kms-key-id":"",' +
        '"x-amz-server-side-encryption-customer-algorithm":"",' +
        '"x-amz-website-redirect-location":"","acl":{"Canned":"private",' +
        '"FULL_CONTROL":[],"WRITE_ACP":[],"READ":[],"READ_ACP":[]},"key":"",' +
        '"location":null,"isDeleteMarker":false,"tags":{},"replicationInfo":' +
        '{"status":"","backends":[],"content":[],"destination":"",' +
        '"storageClass":"","role":"","storageType":"","dataStoreVersionId":"' +
        '"},"dataStoreName":"us-east-1","last-modified":' +
        '"2018-02-20T03:13:43.273Z","md-model-version":3}',
    },
    {
        type: 'put',
        bucket: 'prom',
        key: 'g4',
        value: '{"owner-display-name":"test_1518720219","owner-id":' +
        '"94224c921648ada653f584f3caf42654ccf3f1cbd2e569a24e88eb460f2f84d8",' +
        '"content-length":0,"content-md5":"d41d8cd98f00b204e9800998ecf8427e",' +
        '"x-amz-version-id":"null","x-amz-server-version-id":"",' +
        '"x-amz-storage-class":"STANDARD","x-amz-server-side-encryption":"",' +
        '"x-amz-server-side-encryption-aws-kms-key-id":"",' +
        '"x-amz-server-side-encryption-customer-algorithm":"",' +
        '"x-amz-website-redirect-location":"","acl":{"Canned":"private",' +
        '"FULL_CONTROL":[],"WRITE_ACP":[],"READ":[],"READ_ACP":[]},"key":"",' +
        '"location":null,"isDeleteMarker":false,"tags":{},"replicationInfo":{' +
        '"status":"","backends":[],"content":[],"destination":"","' +
        'storageClass":"","role":"","storageType":"","dataStoreVersionId":' +
        '""},"dataStoreName":"us-east-1","last-modified":' +
        '"2018-02-20T04:47:20.359Z","md-model-version":3}',
    },
];

class MetadataMock {
    onRequest(req, res) {
        console.log('RECEIVED REQUEST');
        console.log('req url', req.url);
        console.log('req query', req.query);
        console.log('req headers', req.headers);
        const url = URL.parse(req.url);
        const query = querystring.parse(req.query);
        const host = req.headers.host.split(':')[0];
        // this.requestsPerHost[host] += 1;
        if (req.method !== 'GET') {
            res.writeHead(501);
            return res.end(JSON.stringify({
                error: 'mock server only supports GET requests',
            }));
        }
        if (/\/_\/raft_sessions\/[1-8]\/bucket/.test(req.url)) {
            console.log('getting buckets for raft session');
            const value = ['bucket1'];
            res.writeHead(200, { 'content-type': 'application/json' });
            // return res.end(JSON.stringify(value));
            return res.end(JSON.stringify(value));
        } else if (/\/default\/attributes\/[a-z0-9]/.test(req.url)) {
            console.log('trying to grab md for request bucket');
            const bucketName = req.url.split('/');
            const bucketMd = dummyBucketMD[bucketName[bucketName.length - 1]];
            const dummyBucketMdObj = new BucketInfo(bucketMd._name, bucketMd._owner,
                bucketMd._ownerDisplayName, bucketMd._creationDate,
                bucketMd._mdBucketModelVersion, bucketMd._acl, bucketMd._transient,
                bucketMd._deleted, bucketMd._serverSideEncryption,
                bucketMd.versioningConfiguration, bucketMd._locationContraint,
                bucketMd._websiteConfiguration, bucketMd._cors, bucketMd._lifeCycle);
            console.log('getting bucket metadata');
            console.log('stringify bucketMd', JSON.stringify(bucketMd));
            console.log('stringify dummyObj', dummyBucketMdObj.serialize());
            return res.end(dummyBucketMdObj.serialize());
        } else if (/\/default\/bucket\/.*?listingType=Delimiter/.test(req.url)) {
            console.log('listing objects in bucket');
            console.log(req.url);
            return res.end(JSON.stringify(objectList));
        } else if (/\/default\/bucket\/.*\/.*?/.test(req.url)) {
            console.log('getting object metadata');
            return res.end(JSON.stringify({
                metadata: 'dogsAreGood',
            }));
        } else if (/\/_\/raft_sessions\/[\d]*\/log\?begin=[\d]*&limit=[\d]*&targetLeader=false/.test(req.url)) {
            console.log('getting raft logs from metadata mock!');
            return res.end(JSON.stringify({
                mockLogs
            }));
        }
        //  else if() {
        //     console.log('getting raft log offset');
        //     return res.end(1);
        // }
        return res.end(JSON.stringify({
            error: 'invalid path',
        }));
    }
}

module.exports = MetadataMock;